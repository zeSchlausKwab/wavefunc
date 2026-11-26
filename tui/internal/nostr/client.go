package nostrclient

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"fiatjaf.com/nostr"
)

// Signer abstracts signing for local keys, NIP-46 bunkers, or read-only sessions.
type Signer interface {
	PubKey() nostr.PubKey
	CanSign() bool
	SignEvent(ctx context.Context, evt *nostr.Event) error
}

// Client coordinates relay reads, publishing, and in-memory caching while
// respecting WaveFunc's relay filter limits and rate budgets.
type Client struct {
	Pool   *nostr.Pool
	Policy RelayPolicy

	mu            sync.RWMutex
	stations      map[string]Station       // address -> Station
	profiles      map[string]Profile       // pubkey hex -> Profile
	health        map[string]StationHealth // station address -> Health
	nowPlaying    map[string]StationTrack  // station address -> Track
	rankings      map[string]StationRanking
	authorOutbox  map[string][]string // pubkey hex -> write relay URLs
	relayConnected bool
	lastError     string
}

func NewClient(appRelay string) *Client {
	return &Client{
		Pool:         nostr.NewPool(),
		Policy:       NewRelayPolicy(appRelay),
		stations:     make(map[string]Station),
		profiles:     make(map[string]Profile),
		health:       make(map[string]StationHealth),
		nowPlaying:   make(map[string]StationTrack),
		rankings:     make(map[string]StationRanking),
		authorOutbox: make(map[string][]string),
	}
}

func (c *Client) Close() {
	c.Pool.Close("wf shutdown")
}

func (c *Client) AppRelayURL() string {
	if len(c.Policy.AppData) > 0 {
		return c.Policy.AppData[0]
	}
	return ProdAppRelay
}

func (c *Client) IsConnected() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.relayConnected
}

func (c *Client) LastError() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.lastError
}

func (c *Client) setConnStatus(ok bool, errMsg string) {
	c.mu.Lock()
	c.relayConnected = ok
	c.lastError = errMsg
	c.mu.Unlock()
}

// WarmAppRelay establishes the primary WebSocket connection early.
func (c *Client) WarmAppRelay(ctx context.Context) error {
	cctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	_, err := c.Pool.EnsureRelay(c.AppRelayURL())
	if err != nil {
		c.setConnStatus(false, err.Error())
		return err
	}
	_ = cctx
	c.setConnStatus(true, "")
	return nil
}

// FetchStationCount uses NIP-45 COUNT on the WaveFunc relay for O(1) corpus count.
func (c *Client) FetchStationCount(ctx context.Context) (int, error) {
	cctx, cancel := context.WithTimeout(ctx, 6*time.Second)
	defer cancel()
	relay, err := c.Pool.EnsureRelay(c.AppRelayURL())
	if err != nil {
		c.setConnStatus(false, err.Error())
		return 0, err
	}
	c.setConnStatus(true, "")
	count, _, err := relay.Count(cctx, nostr.Filter{
		Kinds: []nostr.Kind{KindStation},
	}, nostr.SubscriptionOptions{Label: "wf-station-count"})
	if err != nil {
		return 0, err
	}
	return int(count), nil
}

// StationQuery controls station browsing & NIP-50 search.
type StationQuery struct {
	Search  string
	Genre   string
	Country string
	Limit   int
}

// FetchStations queries stations from the WaveFunc relay respecting production
// filter rules (NIP-50 search requires 2..80 chars; limit <= 500).
func (c *Client) FetchStations(ctx context.Context, q StationQuery) ([]Station, error) {
	limit := q.Limit
	if limit <= 0 || limit > 250 {
		limit = 150
	}
	filter := nostr.Filter{
		Kinds: []nostr.Kind{KindStation},
		Limit: limit,
	}
	trimmed := strings.TrimSpace(q.Search)
	if len(trimmed) >= 2 {
		if len(trimmed) > 80 {
			trimmed = trimmed[:80]
		}
		filter.Search = trimmed
	}
	tags := nostr.TagMap{}
	if g := strings.TrimSpace(q.Genre); g != "" {
		tags["c"] = []string{strings.ToLower(g)}
	}
	if len(tags) > 0 {
		filter.Tags = tags
	}

	cctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	seen := make(map[string]Station)
	for ie := range c.Pool.FetchMany(cctx, c.Policy.AppData, filter, nostr.SubscriptionOptions{Label: "wf-stations"}) {
		st, ok := ParseStation(ie.Event)
		if !ok || len(st.Streams) == 0 {
			continue
		}
		if trimmed != "" && !MatchesStationSearch(st, trimmed) {
			continue
		}
		if cc := strings.ToUpper(strings.TrimSpace(q.Country)); cc != "" && st.CountryCode != cc {
			continue
		}
		prev, exists := seen[st.Address]
		if !exists || st.CreatedAt > prev.CreatedAt {
			seen[st.Address] = st
		}
	}
	c.setConnStatus(true, "")

	out := make([]Station, 0, len(seen))
	c.mu.Lock()
	for addr, st := range seen {
		c.stations[addr] = st
		out = append(out, st)
	}
	c.mu.Unlock()

	sort.Slice(out, func(i, j int) bool {
		if out[i].CreatedAt != out[j].CreatedAt {
			return out[i].CreatedAt > out[j].CreatedAt
		}
		return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name)
	})
	return out, nil
}

// FetchStationsByAddresses resolves a list of 31237:<pubkey>:<d> coordinates in batches.
func (c *Client) FetchStationsByAddresses(ctx context.Context, addresses []string) (map[string]Station, error) {
	result := make(map[string]Station, len(addresses))
	var missing []string

	c.mu.RLock()
	for _, addr := range addresses {
		if !strings.HasPrefix(addr, "31237:") {
			continue
		}
		if st, ok := c.stations[addr]; ok {
			result[addr] = st
		} else {
			missing = append(missing, addr)
		}
	}
	c.mu.RUnlock()

	if len(missing) == 0 {
		return result, nil
	}

	wanted := make(map[string]struct{}, len(missing))
	for _, addr := range missing {
		wanted[addr] = struct{}{}
	}

	// Respect relay caps (max 100 authors, max 200 d-tags per filter).
	const batchSize = 80
	for start := 0; start < len(missing); start += batchSize {
		end := start + batchSize
		if end > len(missing) {
			end = len(missing)
		}
		batch := missing[start:end]

		authorSet := make(map[nostr.PubKey]struct{})
		dSet := make(map[string]struct{})
		for _, addr := range batch {
			parts := strings.SplitN(addr, ":", 3)
			if len(parts) != 3 {
				continue
			}
			pk, err := nostr.PubKeyFromHex(parts[1])
			if err != nil {
				continue
			}
			authorSet[pk] = struct{}{}
			dSet[parts[2]] = struct{}{}
		}
		if len(authorSet) == 0 || len(dSet) == 0 {
			continue
		}
		authors := make([]nostr.PubKey, 0, len(authorSet))
		for pk := range authorSet {
			authors = append(authors, pk)
		}
		dTags := make([]string, 0, len(dSet))
		for d := range dSet {
			dTags = append(dTags, d)
		}

		cctx, cancel := context.WithTimeout(ctx, 8*time.Second)
		for ie := range c.Pool.FetchMany(cctx, c.Policy.AppData, nostr.Filter{
			Kinds:   []nostr.Kind{KindStation},
			Authors: authors,
			Tags:    nostr.TagMap{"d": dTags},
			Limit:   200,
		}, nostr.SubscriptionOptions{Label: "wf-addr-stations"}) {
			st, ok := ParseStation(ie.Event)
			if !ok {
				continue
			}
			c.mu.Lock()
			c.stations[st.Address] = st
			c.mu.Unlock()
			if _, ok := wanted[st.Address]; ok {
				result[st.Address] = st
			}
		}
		cancel()
	}

	return result, nil
}

// DiscoverBundle holds featured collections and signal charts for TRANSMIT discovery.
type DiscoverBundle struct {
	FeaturedLists []FavoritesList
	Rankings      map[string]StationRanking // metric -> snapshot
	Stations      map[string]Station
}

// FetchDiscover loads admin featured lists, observer signal charts (31240), and
// resolves their referenced stations.
func (c *Client) FetchDiscover(ctx context.Context) (DiscoverBundle, error) {
	bundle := DiscoverBundle{
		Rankings: make(map[string]StationRanking),
		Stations: make(map[string]Station),
	}

	now := time.Now().Unix()

	// 1. Signal charts (kind 31240, author = observer pubkey).
	if obsPK, err := nostr.PubKeyFromHex(c.Policy.MetadataServerPubkey()); err == nil {
		cctx, cancel := context.WithTimeout(ctx, 7*time.Second)
		for ie := range c.Pool.FetchMany(cctx, c.Policy.AppData, nostr.Filter{
			Kinds:   []nostr.Kind{KindStationRanking},
			Authors: []nostr.PubKey{obsPK},
			Limit:   24,
		}, nostr.SubscriptionOptions{Label: "wf-rankings"}) {
			r, ok := ParseStationRanking(ie.Event, now)
			if !ok {
				continue
			}
			prev, exists := bundle.Rankings[r.Metric]
			if !exists || r.GeneratedAt > prev.GeneratedAt {
				bundle.Rankings[r.Metric] = r
			}
		}
		cancel()
	}

	// 2. Admin featured list pointers (kind 30078, #l = wavefunc:featured:lists / stations).
	var adminPKs []nostr.PubKey
	for _, hexPK := range c.Policy.AdminPubkeys() {
		if pk, err := nostr.PubKeyFromHex(hexPK); err == nil {
			adminPKs = append(adminPKs, pk)
		}
	}
	var featuredListAddrs []string
	var featuredStationAddrs []string
	if len(adminPKs) > 0 {
		cctx, cancel := context.WithTimeout(ctx, 7*time.Second)
		for ie := range c.Pool.FetchMany(cctx, c.Policy.AppData, nostr.Filter{
			Kinds:   []nostr.Kind{KindAppList},
			Authors: adminPKs,
			Tags:    nostr.TagMap{"l": {LabelFeaturedLists, LabelFeaturedStations}},
			Limit:   20,
		}, nostr.SubscriptionOptions{Label: "wf-admin-features"}) {
			feat, ok := ParseAdminFeature(ie.Event)
			if !ok {
				continue
			}
			switch feat.Type {
			case "lists":
				featuredListAddrs = append(featuredListAddrs, feat.Refs...)
			case "stations":
				featuredStationAddrs = append(featuredStationAddrs, feat.Refs...)
			}
		}
		cancel()
	}

	// Resolve featured favorite lists (30078).
	if len(featuredListAddrs) > 0 {
		authorSet := make(map[nostr.PubKey]struct{})
		dSet := make(map[string]struct{})
		for _, addr := range featuredListAddrs {
			parts := strings.SplitN(addr, ":", 3)
			if len(parts) == 3 && parts[0] == "30078" {
				if pk, err := nostr.PubKeyFromHex(parts[1]); err == nil {
					authorSet[pk] = struct{}{}
					dSet[parts[2]] = struct{}{}
				}
			}
		}
		if len(authorSet) > 0 {
			var authors []nostr.PubKey
			for pk := range authorSet {
				authors = append(authors, pk)
			}
			var dTags []string
			for d := range dSet {
				dTags = append(dTags, d)
			}
			cctx, cancel := context.WithTimeout(ctx, 7*time.Second)
			byAddr := make(map[string]FavoritesList)
			for ie := range c.Pool.FetchMany(cctx, c.Policy.AppData, nostr.Filter{
				Kinds:   []nostr.Kind{KindAppList},
				Authors: authors,
				Tags:    nostr.TagMap{"d": dTags, "l": {LabelFavoritesList}},
				Limit:   50,
			}, nostr.SubscriptionOptions{Label: "wf-featured-lists"}) {
				fl, ok := ParseFavoritesList(ie.Event)
				if !ok {
					continue
				}
				prev, exists := byAddr[fl.Address]
				if !exists || fl.CreatedAt > prev.CreatedAt {
					byAddr[fl.Address] = fl
				}
			}
			cancel()
			for _, fl := range byAddr {
				bundle.FeaturedLists = append(bundle.FeaturedLists, fl)
				featuredStationAddrs = append(featuredStationAddrs, fl.StationAddresses...)
			}
			sort.Slice(bundle.FeaturedLists, func(i, j int) bool {
				return bundle.FeaturedLists[i].Name < bundle.FeaturedLists[j].Name
			})
		}
	}

	// Collect all station addresses referenced by rankings + featured lists.
	addrSet := make(map[string]struct{})
	for _, addr := range featuredStationAddrs {
		if strings.HasPrefix(addr, "31237:") {
			addrSet[addr] = struct{}{}
		}
	}
	for _, r := range bundle.Rankings {
		for i, entry := range r.Entries {
			if i >= 20 {
				break
			}
			if strings.HasPrefix(entry.StationAddress, "31237:") {
				addrSet[entry.StationAddress] = struct{}{}
			}
		}
	}
	var allAddrs []string
	for addr := range addrSet {
		allAddrs = append(allAddrs, addr)
	}
	if len(allAddrs) > 0 {
		resolved, _ := c.FetchStationsByAddresses(ctx, allAddrs)
		bundle.Stations = resolved
	}

	c.mu.Lock()
	for k, v := range bundle.Rankings {
		c.rankings[k] = v
	}
	c.mu.Unlock()
	return bundle, nil
}

// FetchHealthBatch fetches health (31238) and observer now-playing (31239) in
// one batched filter per page to respect the relay's IP rate limiter.
func (c *Client) FetchHealthBatch(ctx context.Context, addresses []string) (map[string]StationHealth, map[string]StationTrack) {
	healthOut := make(map[string]StationHealth)
	tracksOut := make(map[string]StationTrack)
	if len(addresses) == 0 {
		return healthOut, tracksOut
	}
	obsPK, err := nostr.PubKeyFromHex(c.Policy.MetadataServerPubkey())
	if err != nil {
		return healthOut, tracksOut
	}

	targets := make([]string, 0, len(addresses))
	seen := make(map[string]struct{})
	for _, a := range addresses {
		if !strings.HasPrefix(a, "31237:") {
			continue
		}
		if _, ok := seen[a]; ok {
			continue
		}
		seen[a] = struct{}{}
		targets = append(targets, a)
		if len(targets) >= 120 {
			break
		}
	}
	if len(targets) == 0 {
		return healthOut, tracksOut
	}

	now := time.Now().Unix()
	cctx, cancel := context.WithTimeout(ctx, 6*time.Second)
	defer cancel()

	for ie := range c.Pool.FetchMany(cctx, c.Policy.AppData, nostr.Filter{
		Kinds:   []nostr.Kind{KindStationHealth, KindStationNowPlaying},
		Authors: []nostr.PubKey{obsPK},
		Tags:    nostr.TagMap{"a": targets},
		Limit:   250,
	}, nostr.SubscriptionOptions{Label: "wf-health-batch"}) {
		if h, ok := ParseStationHealth(ie.Event, now); ok {
			prev, exists := healthOut[h.StationAddress]
			if !exists || h.CheckedAt > prev.CheckedAt {
				healthOut[h.StationAddress] = h
			}
		} else if tr, ok := ParseStationTrack(ie.Event, now); ok {
			prev, exists := tracksOut[tr.StationAddress]
			if !exists || tr.ObservedAt > prev.ObservedAt {
				tracksOut[tr.StationAddress] = tr
			}
		}
	}

	c.mu.Lock()
	for k, v := range healthOut {
		c.health[k] = v
	}
	for k, v := range tracksOut {
		c.nowPlaying[k] = v
	}
	c.mu.Unlock()

	return healthOut, tracksOut
}

func (c *Client) CachedHealth(address string) (StationHealth, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	h, ok := c.health[address]
	return h, ok
}

func (c *Client) CachedNowPlaying(address string) (StationTrack, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	tr, ok := c.nowPlaying[address]
	return tr, ok
}

// UserListsBundle holds both favorite station lists and liked song lists for a user.
type UserListsBundle struct {
	FavoriteLists []FavoritesList
	SongLists     []SongList
	Stations      map[string]Station
	Songs         map[string]Song
}

// FetchUserLists fetches all WaveFunc station favorite lists and song lists for a pubkey.
func (c *Client) FetchUserLists(ctx context.Context, pubkey nostr.PubKey) (UserListsBundle, error) {
	bundle := UserListsBundle{
		Stations: make(map[string]Station),
		Songs:    make(map[string]Song),
	}

	cctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()

	// Check for kind 5 deletions of the user's 30078 lists so deleted lists stay hidden.
	deletedAddrs := make(map[string]int64)
	for ie := range c.Pool.FetchMany(cctx, c.Policy.AppData, nostr.Filter{
		Kinds:   []nostr.Kind{KindDeletion},
		Authors: []nostr.PubKey{pubkey},
		Tags:    nostr.TagMap{"k": {"30078"}},
		Limit:   100,
	}, nostr.SubscriptionOptions{Label: "wf-list-deletions"}) {
		for _, tag := range matchingTags(ie.Event.Tags, "a") {
			if prev, ok := deletedAddrs[tag[1]]; !ok || int64(ie.Event.CreatedAt) > prev {
				deletedAddrs[tag[1]] = int64(ie.Event.CreatedAt)
			}
		}
	}

	favByAddr := make(map[string]FavoritesList)
	songByAddr := make(map[string]SongList)
	for ie := range c.Pool.FetchMany(cctx, c.Policy.AppData, nostr.Filter{
		Kinds:   []nostr.Kind{KindAppList},
		Authors: []nostr.PubKey{pubkey},
		Tags:    nostr.TagMap{"l": {LabelFavoritesList, LabelSongList}},
		Limit:   100,
	}, nostr.SubscriptionOptions{Label: "wf-user-lists"}) {
		if fl, ok := ParseFavoritesList(ie.Event); ok {
			if delAt, deleted := deletedAddrs[fl.Address]; deleted && delAt >= fl.CreatedAt {
				continue
			}
			prev, exists := favByAddr[fl.Address]
			if !exists || fl.CreatedAt > prev.CreatedAt {
				favByAddr[fl.Address] = fl
			}
		} else if sl, ok := ParseSongList(ie.Event); ok {
			if delAt, deleted := deletedAddrs[sl.Address]; deleted && delAt >= sl.CreatedAt {
				continue
			}
			prev, exists := songByAddr[sl.Address]
			if !exists || sl.CreatedAt > prev.CreatedAt {
				songByAddr[sl.Address] = sl
			}
		}
	}

	var stationAddrs []string
	for _, fl := range favByAddr {
		bundle.FavoriteLists = append(bundle.FavoriteLists, fl)
		stationAddrs = append(stationAddrs, fl.StationAddresses...)
	}
	sort.Slice(bundle.FavoriteLists, func(i, j int) bool {
		return bundle.FavoriteLists[i].CreatedAt > bundle.FavoriteLists[j].CreatedAt
	})

	var songAddrs []string
	for _, sl := range songByAddr {
		bundle.SongLists = append(bundle.SongLists, sl)
		songAddrs = append(songAddrs, sl.SongAddresses...)
	}
	sort.Slice(bundle.SongLists, func(i, j int) bool {
		return bundle.SongLists[i].CreatedAt > bundle.SongLists[j].CreatedAt
	})

	if len(stationAddrs) > 0 {
		resolved, _ := c.FetchStationsByAddresses(ctx, stationAddrs)
		bundle.Stations = resolved
	}
	if len(songAddrs) > 0 {
		bundle.Songs = c.FetchSongsByAddresses(ctx, songAddrs)
	}

	return bundle, nil
}

// FetchSongsByAddresses resolves kind 31337 song events.
func (c *Client) FetchSongsByAddresses(ctx context.Context, addresses []string) map[string]Song {
	out := make(map[string]Song)
	authorSet := make(map[nostr.PubKey]struct{})
	dSet := make(map[string]struct{})
	for _, addr := range addresses {
		parts := strings.SplitN(addr, ":", 3)
		if len(parts) != 3 || parts[0] != "31337" {
			continue
		}
		if pk, err := nostr.PubKeyFromHex(parts[1]); err == nil {
			authorSet[pk] = struct{}{}
			dSet[parts[2]] = struct{}{}
		}
	}
	if len(authorSet) == 0 || len(dSet) == 0 {
		return out
	}
	var authors []nostr.PubKey
	for pk := range authorSet {
		authors = append(authors, pk)
	}
	var dTags []string
	for d := range dSet {
		dTags = append(dTags, d)
	}
	cctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	for ie := range c.Pool.FetchMany(cctx, c.Policy.AppData, nostr.Filter{
		Kinds:   []nostr.Kind{KindSong},
		Authors: authors,
		Tags:    nostr.TagMap{"d": dTags},
		Limit:   200,
	}, nostr.SubscriptionOptions{Label: "wf-songs-addr"}) {
		if song, ok := ParseSong(ie.Event); ok {
			prev, exists := out[song.Address]
			if !exists || song.CreatedAt > prev.CreatedAt {
				out[song.Address] = song
			}
		}
	}
	return out
}

// FetchCommunitySignals loads recent kind 31337 songs published across WaveFunc.
func (c *Client) FetchCommunitySignals(ctx context.Context, limit int) ([]Song, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	cctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()

	byAddr := make(map[string]Song)
	for ie := range c.Pool.FetchMany(cctx, c.Policy.AppData, nostr.Filter{
		Kinds: []nostr.Kind{KindSong},
		Limit: limit,
	}, nostr.SubscriptionOptions{Label: "wf-signals"}) {
		if song, ok := ParseSong(ie.Event); ok {
			prev, exists := byAddr[song.Address]
			if !exists || song.CreatedAt > prev.CreatedAt {
				byAddr[song.Address] = song
			}
		}
	}
	out := make([]Song, 0, len(byAddr))
	for _, s := range byAddr {
		out = append(out, s)
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].CreatedAt > out[j].CreatedAt
	})
	return out, nil
}

// StationSocial holds reactions and threaded comments for a single station.
type StationSocial struct {
	StationAddress string
	ReactionCount  int
	UserReacted    bool
	Comments       []*CommentNode
	FlatComments   []*CommentNode
}

// FetchStationSocial loads reactions (kind 7) and NIP-22 comments (kind 1111) for a station.
func (c *Client) FetchStationSocial(ctx context.Context, station Station, viewerPubkey string) (StationSocial, error) {
	out := StationSocial{StationAddress: station.Address}
	if station.Address == "" {
		return out, nil
	}
	cctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()

	relays := c.Policy.SocialRead
	reactors := make(map[string]struct{})
	commentsByID := make(map[string]nostr.Event)

	// Query by uppercase A (NIP-22 root) and lowercase a (reactions + legacy comments).
	var wg sync.WaitGroup
	var mu sync.Mutex

	fetch := func(filter nostr.Filter, label string) {
		defer wg.Done()
		for ie := range c.Pool.FetchMany(cctx, relays, filter, nostr.SubscriptionOptions{Label: label}) {
			mu.Lock()
			switch ie.Event.Kind {
			case KindReaction:
				if ie.Event.Content != "-" {
					reactors[ie.Event.PubKey.Hex()] = struct{}{}
				}
			case KindComment:
				commentsByID[ie.Event.ID.Hex()] = ie.Event
			}
			mu.Unlock()
		}
	}

	wg.Add(2)
	go fetch(nostr.Filter{
		Kinds: []nostr.Kind{KindReaction, KindComment},
		Tags:  nostr.TagMap{"a": {station.Address}},
		Limit: 200,
	}, "wf-station-social-a")
	go fetch(nostr.Filter{
		Kinds: []nostr.Kind{KindComment},
		Tags:  nostr.TagMap{"A": {station.Address}},
		Limit: 200,
	}, "wf-station-social-A")
	wg.Wait()

	out.ReactionCount = len(reactors)
	if viewerPubkey != "" {
		_, out.UserReacted = reactors[viewerPubkey]
	}

	commentEvents := make([]nostr.Event, 0, len(commentsByID))
	var pubkeys []string
	for _, ev := range commentsByID {
		commentEvents = append(commentEvents, ev)
		pubkeys = append(pubkeys, ev.PubKey.Hex())
	}
	out.Comments = BuildCommentTree(commentEvents, station.ID)
	out.FlatComments = FlattenComments(out.Comments)

	if len(pubkeys) > 0 {
		c.FetchProfilesBatch(ctx, pubkeys)
	}
	return out, nil
}

// FetchCommunityFeed fetches #wavefunc kind 1 notes within a bounded window.
func (c *Client) FetchCommunityFeed(ctx context.Context, since, until int64, limit int) ([]CommunityPost, error) {
	if limit <= 0 || limit > 150 {
		limit = 80
	}
	filter := nostr.Filter{
		Kinds: []nostr.Kind{KindNote},
		Tags:  nostr.TagMap{"t": {CommunityTopic}},
		Limit: limit,
	}
	if since > 0 {
		filter.Since = nostr.Timestamp(since)
	}
	if until > 0 {
		filter.Until = nostr.Timestamp(until)
	}

	cctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()

	byID := make(map[string]CommunityPost)
	for ie := range c.Pool.FetchMany(cctx, c.Policy.SocialRead, filter, nostr.SubscriptionOptions{Label: "wf-assembly"}) {
		post := ParseCommunityPost(ie.Event)
		byID[post.ID] = post
	}

	out := make([]CommunityPost, 0, len(byID))
	var pubkeys []string
	for _, p := range byID {
		out = append(out, p)
		pubkeys = append(pubkeys, p.PubKey)
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].CreatedAt > out[j].CreatedAt
	})
	if len(pubkeys) > 0 {
		c.FetchProfilesBatch(ctx, pubkeys)
	}
	return out, nil
}

// FetchProfilesBatch loads missing kind 0 profiles from identity/general relays.
func (c *Client) FetchProfilesBatch(ctx context.Context, hexPubkeys []string) {
	var missing []nostr.PubKey
	seen := make(map[string]struct{})
	c.mu.RLock()
	for _, hexPK := range hexPubkeys {
		if hexPK == "" {
			continue
		}
		if _, ok := seen[hexPK]; ok {
			continue
		}
		if _, cached := c.profiles[hexPK]; cached {
			continue
		}
		pk, err := nostr.PubKeyFromHex(hexPK)
		if err != nil {
			continue
		}
		seen[hexPK] = struct{}{}
		missing = append(missing, pk)
		if len(missing) >= 80 {
			break
		}
	}
	c.mu.RUnlock()

	if len(missing) == 0 {
		return
	}

	cctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	latest := make(map[string]nostr.Event)
	for ie := range c.Pool.FetchMany(cctx, c.Policy.IdentityRead, nostr.Filter{
		Kinds:   []nostr.Kind{KindProfile},
		Authors: missing,
		Limit:   len(missing) * 2,
	}, nostr.SubscriptionOptions{Label: "wf-profiles"}) {
		hexPK := ie.Event.PubKey.Hex()
		if prev, ok := latest[hexPK]; !ok || ie.Event.CreatedAt > prev.CreatedAt {
			latest[hexPK] = ie.Event
		}
	}

	c.mu.Lock()
	for hexPK, ev := range latest {
		if prof, ok := ParseProfile(ev); ok {
			c.profiles[hexPK] = prof
		}
	}
	c.mu.Unlock()
}

// FetchAuthorMailboxes warms NIP-65 write relays for the active user.
func (c *Client) FetchAuthorMailboxes(ctx context.Context, pk nostr.PubKey) []string {
	cctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var latest *nostr.Event
	for ie := range c.Pool.FetchMany(cctx, c.Policy.IdentityRead, nostr.Filter{
		Kinds:   []nostr.Kind{KindRelayList},
		Authors: []nostr.PubKey{pk},
		Limit:   1,
	}, nostr.SubscriptionOptions{Label: "wf-mailboxes"}) {
		ev := ie.Event
		if latest == nil || ev.CreatedAt > latest.CreatedAt {
			latest = &ev
		}
	}
	if latest == nil {
		return nil
	}
	var outboxes []string
	for _, tag := range latest.Tags {
		if len(tag) < 2 || tag[0] != "r" {
			continue
		}
		marker := ""
		if len(tag) >= 3 {
			marker = strings.ToLower(tag[2])
		}
		if marker == "" || marker == "write" {
			outboxes = append(outboxes, tag[1])
		}
	}
	outboxes = UniqueRelays(outboxes)
	c.mu.Lock()
	c.authorOutbox[pk.Hex()] = outboxes
	c.mu.Unlock()
	return outboxes
}

func (c *Client) Profile(hexPK string) Profile {
	c.mu.RLock()
	p, ok := c.profiles[hexPK]
	c.mu.RUnlock()
	if ok {
		return p
	}
	return Profile{PubKey: hexPK}
}

func (c *Client) SetProfile(p Profile) {
	c.mu.Lock()
	c.profiles[p.PubKey] = p
	c.mu.Unlock()
}

// SeedDemoCache populates health, now-playing, and connected status for teaser capture.
func (c *Client) SeedDemoCache(health map[string]StationHealth, tracks map[string]StationTrack) {
	c.mu.Lock()
	c.relayConnected = true
	c.lastError = ""
	for k, v := range health {
		c.health[k] = v
	}
	for k, v := range tracks {
		c.nowPlaying[k] = v
	}
	c.mu.Unlock()
}

// PublishSigned signs evt with signer and publishes to policy-selected relays.
// Returns nil only if at least one relay accepts the event.
func (c *Client) PublishSigned(ctx context.Context, signer Signer, evt nostr.Event, recipientInboxes []string) (nostr.Event, error) {
	if signer == nil || !signer.CanSign() {
		return evt, errors.New("sign in with a Nostr key or remote signer to perform this action")
	}
	evt.PubKey = signer.PubKey()
	if evt.CreatedAt == 0 {
		evt.CreatedAt = nostr.Now()
	}
	signCtx, signCancel := context.WithTimeout(ctx, 30*time.Second)
	defer signCancel()
	if err := signer.SignEvent(signCtx, &evt); err != nil {
		return evt, fmt.Errorf("sign event: %w", err)
	}

	c.mu.RLock()
	outboxes := c.authorOutbox[evt.PubKey.Hex()]
	c.mu.RUnlock()

	targets := SelectPublishRelays(c.Policy, evt, outboxes, recipientInboxes)
	if len(targets) == 0 {
		return evt, errors.New("no target relays configured")
	}

	pubCtx, pubCancel := context.WithTimeout(ctx, 10*time.Second)
	defer pubCancel()

	accepted := 0
	var lastErr error
	for res := range c.Pool.PublishMany(pubCtx, targets, evt) {
		if res.Error == nil {
			accepted++
		} else {
			lastErr = fmt.Errorf("%s: %w", res.RelayURL, res.Error)
		}
	}
	if accepted == 0 {
		if lastErr != nil {
			return evt, fmt.Errorf("publish rejected by all relays: %w", lastErr)
		}
		return evt, errors.New("publish failed on all relays")
	}
	return evt, nil
}
