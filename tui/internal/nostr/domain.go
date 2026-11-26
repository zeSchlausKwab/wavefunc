package nostrclient

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"fiatjaf.com/nostr"
)

const (
	KindProfile           nostr.Kind = 0
	KindNote              nostr.Kind = 1
	KindDeletion          nostr.Kind = 5
	KindReaction          nostr.Kind = 7
	KindComment           nostr.Kind = 1111
	KindReport            nostr.Kind = 1985
	KindNutzap            nostr.Kind = 9321
	KindRelayList         nostr.Kind = 10002
	KindAppList           nostr.Kind = 30078
	KindListeningStatus   nostr.Kind = 30315
	KindStation           nostr.Kind = 31237
	KindStationHealth     nostr.Kind = 31238
	KindStationNowPlaying nostr.Kind = 31239
	KindStationRanking    nostr.Kind = 31240
	KindSong              nostr.Kind = 31337

	LabelFavoritesList    = "wavefunc_user_favourite_list"
	LabelSongList         = "wavefunc_user_song_list"
	LabelFeaturedLists    = "wavefunc:featured:lists"
	LabelFeaturedStations = "wavefunc:featured:stations"
	CommunityTopic        = "wavefunc"
)

// --- Tag helpers ---

func firstTagValue(tags nostr.Tags, name string) string {
	for _, tag := range tags {
		if len(tag) >= 2 && tag[0] == name {
			return tag[1]
		}
	}
	return ""
}

func matchingTags(tags nostr.Tags, name string) []nostr.Tag {
	var out []nostr.Tag
	for _, tag := range tags {
		if len(tag) >= 2 && tag[0] == name {
			out = append(out, tag)
		}
	}
	return out
}

func isExpired(tags nostr.Tags, now int64) bool {
	raw := firstTagValue(tags, "expiration")
	if raw == "" {
		return false
	}
	exp, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return false
	}
	return exp <= now
}

func newUUID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

// --- Stations (kind 31237) ---

type StreamQuality struct {
	Bitrate    int    `json:"bitrate"`
	Codec      string `json:"codec"`
	SampleRate int    `json:"sampleRate"`
}

type Stream struct {
	URL     string        `json:"url"`
	Format  string        `json:"format"`
	Quality StreamQuality `json:"quality"`
	Primary bool          `json:"primary,omitempty"`
}

type stationContentJSON struct {
	Description        string   `json:"description"`
	Streams            []Stream `json:"streams"`
	StreamingServerURL string   `json:"streamingServerUrl,omitempty"`
}

type Station struct {
	Event              nostr.Event
	ID                 string
	PubKey             string
	CreatedAt          int64
	StationID          string
	Address            string
	Name               string
	Description        string
	Thumbnail          string
	Website            string
	Location           string
	CountryCode        string
	Genres             []string
	Languages          []string
	Streams            []Stream
	StreamingServerURL string
}

func normalizeStreamURL(raw string) string {
	s := strings.TrimSpace(raw)
	s = strings.TrimPrefix(s, "`")
	s = strings.TrimSuffix(s, "`")
	return s
}

func parseStreamTag(tag nostr.Tag) (Stream, bool) {
	if len(tag) < 4 || tag[1] == "" || tag[2] == "" || tag[3] == "" {
		return Stream{}, false
	}
	var q StreamQuality
	if err := json.Unmarshal([]byte(tag[3]), &q); err != nil {
		return Stream{}, false
	}
	primary := false
	for _, field := range tag[4:] {
		if field == "primary" {
			primary = true
			break
		}
	}
	return Stream{
		URL:     normalizeStreamURL(tag[1]),
		Format:  tag[2],
		Quality: q,
		Primary: primary,
	}, true
}

// ParseStation decodes a kind 31237 radio station event with parity to station.ts.
func ParseStation(ev nostr.Event) (Station, bool) {
	if ev.Kind != KindStation {
		return Station{}, false
	}
	var content stationContentJSON
	_ = json.Unmarshal([]byte(ev.Content), &content)

	var tagStreams []Stream
	for _, tag := range matchingTags(ev.Tags, "stream") {
		if st, ok := parseStreamTag(tag); ok {
			tagStreams = append(tagStreams, st)
		}
	}
	streams := tagStreams
	if len(streams) == 0 {
		for _, st := range content.Streams {
			st.URL = normalizeStreamURL(st.URL)
			if st.URL != "" {
				streams = append(streams, st)
			}
		}
	}

	dTag := firstTagValue(ev.Tags, "d")
	pub := ev.PubKey.Hex()
	addr := ""
	if dTag != "" && pub != "" {
		addr = fmt.Sprintf("%d:%s:%s", KindStation, pub, dTag)
	}

	desc := firstTagValue(ev.Tags, "description")
	if desc == "" {
		desc = content.Description
	}
	country := firstTagValue(ev.Tags, "country")
	if country == "" {
		country = firstTagValue(ev.Tags, "countryCode")
	}

	var genres []string
	for _, tag := range matchingTags(ev.Tags, "c") {
		if len(tag) >= 3 && tag[2] == "genre" && tag[1] != "" {
			genres = append(genres, tag[1])
		}
	}
	var langs []string
	for _, tag := range matchingTags(ev.Tags, "l") {
		if tag[1] != "" {
			langs = append(langs, tag[1])
		}
	}

	name := strings.TrimSpace(firstTagValue(ev.Tags, "name"))
	if name == "" {
		name = dTag
	}

	return Station{
		Event:              ev,
		ID:                 ev.ID.Hex(),
		PubKey:             pub,
		CreatedAt:          int64(ev.CreatedAt),
		StationID:          dTag,
		Address:            addr,
		Name:               name,
		Description:        desc,
		Thumbnail:          firstTagValue(ev.Tags, "thumbnail"),
		Website:            firstTagValue(ev.Tags, "website"),
		Location:           firstTagValue(ev.Tags, "location"),
		CountryCode:        strings.ToUpper(country),
		Genres:             genres,
		Languages:          langs,
		Streams:            streams,
		StreamingServerURL: content.StreamingServerURL,
	}, true
}

// PrimaryStream returns the preferred stream for display/playback.
func (s Station) PrimaryStream() (Stream, bool) {
	if len(s.Streams) == 0 {
		return Stream{}, false
	}
	for _, st := range s.Streams {
		if st.Primary {
			return st, true
		}
	}
	return s.Streams[0], true
}

// DisplayLabel formats a stream's codec and bitrate cleanly (e.g. "128k AAC" or "MP3"),
// omitting bitrate whenever unknown/zero so "0k" is never displayed.
func (st Stream) DisplayLabel() string {
	codec := strings.ToUpper(strings.TrimSpace(st.Quality.Codec))
	if codec == "" {
		f := strings.ToLower(st.Format)
		u := strings.ToLower(st.URL)
		switch {
		case strings.Contains(f, "aac"):
			codec = "AAC"
		case strings.Contains(f, "mpeg") && !strings.Contains(f, "mpegurl"):
			codec = "MP3"
		case strings.Contains(f, "ogg"):
			codec = "OGG"
		case strings.Contains(f, "flac"):
			codec = "FLAC"
		case strings.Contains(f, "mpegurl") || strings.Contains(u, ".m3u8"):
			codec = "HLS"
		default:
			codec = "STREAM"
		}
	}
	kbps := st.Quality.Bitrate
	if kbps >= 1000 {
		kbps = kbps / 1000
	}
	switch {
	case kbps > 0 && codec != "":
		return fmt.Sprintf("%dk %s", kbps, codec)
	case kbps > 0:
		return fmt.Sprintf("%dk", kbps)
	default:
		return codec
	}
}

// QualityBadge returns a concise label like "128k AAC" or "MP3".
func (s Station) QualityBadge() string {
	st, ok := s.PrimaryStream()
	if !ok {
		return ""
	}
	return st.DisplayLabel()
}

var nonWordRe = regexp.MustCompile(`[^a-z0-9]+`)

func tokenize(text string) []string {
	parts := nonWordRe.Split(strings.ToLower(text), -1)
	var out []string
	for _, p := range parts {
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

// MatchesStationSearch mirrors Bleve's standard analyzer (AND over terms,
// exact or prefix match per term) as implemented in useStations.ts.
func MatchesStationSearch(station Station, query string) bool {
	terms := tokenize(query)
	if len(terms) == 0 {
		return true
	}
	haystacks := []string{
		station.Name,
		station.Description,
		station.Location,
		station.Website,
		station.CountryCode,
	}
	haystacks = append(haystacks, station.Genres...)
	haystacks = append(haystacks, station.Languages...)

	tokenSet := make(map[string]struct{})
	var allTokens []string
	for _, h := range haystacks {
		for _, tok := range tokenize(h) {
			if _, ok := tokenSet[tok]; !ok {
				tokenSet[tok] = struct{}{}
				allTokens = append(allTokens, tok)
			}
		}
	}

	for _, term := range terms {
		if _, ok := tokenSet[term]; ok {
			continue
		}
		matched := false
		for _, tok := range allTokens {
			if strings.HasPrefix(tok, term) {
				matched = true
				break
			}
		}
		if !matched {
			return false
		}
	}
	return true
}

// --- Observations & Signal Charts (31238, 31239, 31240) ---

type StationHealth struct {
	StationAddress      string   `json:"stationAddress"`
	Status              string   `json:"status"` // up, degraded, down, unknown
	Score               int      `json:"score"`
	CheckedAt           int64    `json:"checkedAt"`
	LatencyMs           int      `json:"latencyMs,omitempty"`
	ConsecutiveFailures int      `json:"consecutiveFailures"`
	Insecure            bool     `json:"insecure"`
	Evidence            []string `json:"evidence,omitempty"`
}

func ParseStationHealth(ev nostr.Event, now int64) (StationHealth, bool) {
	if ev.Kind != KindStationHealth || isExpired(ev.Tags, now) {
		return StationHealth{}, false
	}
	target := firstTagValue(ev.Tags, "a")
	dTag := firstTagValue(ev.Tags, "d")
	if target == "" || target != dTag || !strings.HasPrefix(target, "31237:") {
		return StationHealth{}, false
	}
	var h StationHealth
	if err := json.Unmarshal([]byte(ev.Content), &h); err != nil {
		return StationHealth{}, false
	}
	if h.StationAddress != "" && h.StationAddress != target {
		return StationHealth{}, false
	}
	if h.StationAddress == "" {
		h.StationAddress = target
	}
	return h, true
}

type StationTrack struct {
	StationAddress string `json:"stationAddress"`
	ObservedAt     int64  `json:"observedAt"`
	Title          string `json:"title,omitempty"`
	Artist         string `json:"artist,omitempty"`
	Song           string `json:"song,omitempty"`
	Album          string `json:"album,omitempty"`
	MBID           string `json:"mbid,omitempty"`
	Source         string `json:"source,omitempty"`
}

func (t StationTrack) Display() string {
	title := strings.TrimSpace(t.Song)
	if title == "" {
		title = strings.TrimSpace(t.Title)
	}
	artist := strings.TrimSpace(t.Artist)
	switch {
	case artist != "" && title != "":
		return artist + " — " + title
	case title != "":
		return title
	default:
		return artist
	}
}

func ParseStationTrack(ev nostr.Event, now int64) (StationTrack, bool) {
	if ev.Kind != KindStationNowPlaying || isExpired(ev.Tags, now) {
		return StationTrack{}, false
	}
	target := firstTagValue(ev.Tags, "a")
	dTag := firstTagValue(ev.Tags, "d")
	if target == "" || target != dTag || !strings.HasPrefix(target, "31237:") {
		return StationTrack{}, false
	}
	var tr StationTrack
	if err := json.Unmarshal([]byte(ev.Content), &tr); err != nil {
		return StationTrack{}, false
	}
	if tr.StationAddress == "" {
		tr.StationAddress = target
	}
	return tr, true
}

type RankingEntry struct {
	StationAddress string  `json:"stationAddress"`
	Value          float64 `json:"value"`
	Label          string  `json:"label,omitempty"`
	Title          string  `json:"title,omitempty"`
	Artist         string  `json:"artist,omitempty"`
	ObservedAt     int64   `json:"observedAt,omitempty"`
}

type StationRanking struct {
	Metric      string         `json:"metric"`
	Window      string         `json:"window"`
	GeneratedAt int64          `json:"generatedAt"`
	Entries     []RankingEntry `json:"entries"`
}

func ParseStationRanking(ev nostr.Event, now int64) (StationRanking, bool) {
	if ev.Kind != KindStationRanking || isExpired(ev.Tags, now) {
		return StationRanking{}, false
	}
	dTag := firstTagValue(ev.Tags, "d")
	var r StationRanking
	if err := json.Unmarshal([]byte(ev.Content), &r); err != nil {
		return StationRanking{}, false
	}
	if r.Metric == "" || r.Window == "" || dTag != r.Metric+":"+r.Window {
		return StationRanking{}, false
	}
	return r, true
}

// --- Favorites Lists (kind 30078, l = wavefunc_user_favourite_list) ---

type favoritesContentJSON struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Image       string `json:"image,omitempty"`
	Banner      string `json:"banner,omitempty"`
}

type FavoritesList struct {
	Event            nostr.Event
	ID               string
	PubKey           string
	CreatedAt        int64
	FavoritesID      string
	Address          string
	Name             string
	Description      string
	StationAddresses []string
}

func (f FavoritesList) HasStation(addr string) bool {
	for _, a := range f.StationAddresses {
		if a == addr {
			return true
		}
	}
	return false
}

func ParseFavoritesList(ev nostr.Event) (FavoritesList, bool) {
	if ev.Kind != KindAppList || firstTagValue(ev.Tags, "l") != LabelFavoritesList {
		return FavoritesList{}, false
	}
	var content favoritesContentJSON
	_ = json.Unmarshal([]byte(ev.Content), &content)

	dTag := firstTagValue(ev.Tags, "d")
	name := firstTagValue(ev.Tags, "name")
	if name == "" {
		name = content.Name
	}
	if name == "" {
		name = "My Favorite Stations"
	}
	desc := firstTagValue(ev.Tags, "description")
	if desc == "" {
		desc = content.Description
	}
	var addrs []string
	for _, tag := range matchingTags(ev.Tags, "a") {
		if strings.HasPrefix(tag[1], "31237:") {
			addrs = append(addrs, tag[1])
		}
	}
	pub := ev.PubKey.Hex()
	addr := ""
	if dTag != "" && pub != "" {
		addr = fmt.Sprintf("%d:%s:%s", KindAppList, pub, dTag)
	}
	return FavoritesList{
		Event:            ev,
		ID:               ev.ID.Hex(),
		PubKey:           pub,
		CreatedAt:        int64(ev.CreatedAt),
		FavoritesID:      dTag,
		Address:          addr,
		Name:             name,
		Description:      desc,
		StationAddresses: addrs,
	}, true
}

func BuildFavoritesListEvent(favoritesID, name, description string, stationAddresses []string) nostr.Event {
	if favoritesID == "" {
		favoritesID = newUUID()
	}
	if strings.TrimSpace(name) == "" {
		name = "My Favorite Stations"
	}
	contentBytes, _ := json.Marshal(favoritesContentJSON{
		Name:        name,
		Description: description,
	})
	tags := nostr.Tags{
		{"d", favoritesID},
		{"l", LabelFavoritesList},
		{"name", name},
	}
	for _, addr := range stationAddresses {
		if strings.HasPrefix(addr, "31237:") {
			tags = append(tags, nostr.Tag{"a", addr})
		}
	}
	if description != "" {
		tags = append(tags, nostr.Tag{"description", description})
	}
	return nostr.Event{
		Kind:      KindAppList,
		CreatedAt: nostr.Now(),
		Content:   string(contentBytes),
		Tags:      tags,
	}
}

func BuildFavoritesAddStation(ev nostr.Event, stationAddress, relayHint string) nostr.Event {
	parsed, _ := ParseFavoritesList(ev)
	if parsed.HasStation(stationAddress) {
		clone := ev
		clone.CreatedAt = nostr.Now()
		return clone
	}
	tags := make(nostr.Tags, 0, len(ev.Tags)+1)
	for _, t := range ev.Tags {
		cp := make(nostr.Tag, len(t))
		copy(cp, t)
		tags = append(tags, cp)
	}
	if relayHint != "" {
		tags = append(tags, nostr.Tag{"a", stationAddress, relayHint})
	} else {
		tags = append(tags, nostr.Tag{"a", stationAddress})
	}
	return nostr.Event{
		Kind:      KindAppList,
		CreatedAt: nostr.Now(),
		Content:   ev.Content,
		Tags:      tags,
	}
}

func BuildFavoritesRemoveStation(ev nostr.Event, stationAddress string) nostr.Event {
	tags := make(nostr.Tags, 0, len(ev.Tags))
	for _, t := range ev.Tags {
		if len(t) >= 2 && t[0] == "a" && t[1] == stationAddress {
			continue
		}
		cp := make(nostr.Tag, len(t))
		copy(cp, t)
		tags = append(tags, cp)
	}
	return nostr.Event{
		Kind:      KindAppList,
		CreatedAt: nostr.Now(),
		Content:   ev.Content,
		Tags:      tags,
	}
}

func BuildListDeletionEvent(ev nostr.Event, reason string) nostr.Event {
	if reason == "" {
		reason = "Deleted favorites list"
	}
	tags := nostr.Tags{
		{"e", ev.ID.Hex()},
		{"k", strconv.Itoa(int(ev.Kind))},
		{"p", ev.PubKey.Hex()},
	}
	if dTag := firstTagValue(ev.Tags, "d"); dTag != "" {
		tags = append(tags, nostr.Tag{"a", fmt.Sprintf("%d:%s:%s", ev.Kind, ev.PubKey.Hex(), dTag)})
	}
	return nostr.Event{
		Kind:      KindDeletion,
		CreatedAt: nostr.Now(),
		Content:   reason,
		Tags:      tags,
	}
}

// --- Admin Featured Collections (kind 30078, l = wavefunc:featured:*) ---

type AdminFeature struct {
	Type string // "lists" | "stations" | "users"
	Refs []string
}

func ParseAdminFeature(ev nostr.Event) (AdminFeature, bool) {
	if ev.Kind != KindAppList {
		return AdminFeature{}, false
	}
	label := firstTagValue(ev.Tags, "l")
	const prefix = "wavefunc:featured:"
	if !strings.HasPrefix(label, prefix) {
		return AdminFeature{}, false
	}
	featType := strings.TrimPrefix(label, prefix)
	if featType != "lists" && featType != "stations" && featType != "users" {
		return AdminFeature{}, false
	}
	var refs []string
	for _, tag := range matchingTags(ev.Tags, "a") {
		if tag[1] != "" {
			refs = append(refs, tag[1])
		}
	}
	return AdminFeature{Type: featType, Refs: refs}, true
}

// --- Songs (kind 31337) & Song Lists (kind 30078, l = wavefunc_user_song_list) ---

type Song struct {
	Event       nostr.Event
	ID          string
	PubKey      string
	CreatedAt   int64
	SongID      string
	Address     string
	Title       string
	Artist      string
	Album       string
	MBID        string
	ReleaseYear int
	Duration    int
	Genres      []string
	AudioURL    string
}

func ParseSong(ev nostr.Event) (Song, bool) {
	if ev.Kind != KindSong {
		return Song{}, false
	}
	dTag := firstTagValue(ev.Tags, "d")
	pub := ev.PubKey.Hex()
	addr := ""
	if dTag != "" && pub != "" {
		addr = fmt.Sprintf("%d:%s:%s", KindSong, pub, dTag)
	}
	var artist, album, mbid string
	for _, tag := range ev.Tags {
		if len(tag) >= 3 && tag[0] == "c" && tag[2] == "artist" && artist == "" {
			artist = tag[1]
		}
		if len(tag) >= 3 && tag[0] == "c" && tag[2] == "album" && album == "" {
			album = tag[1]
		}
		if len(tag) >= 2 && tag[0] == "i" && strings.HasPrefix(tag[1], "mbid:") && mbid == "" {
			mbid = strings.TrimPrefix(tag[1], "mbid:")
		}
	}
	var year int
	if raw := firstTagValue(ev.Tags, "published_at"); raw != "" {
		if ts, err := strconv.ParseInt(raw, 10, 64); err == nil && ts > 0 {
			year = time.Unix(ts, 0).UTC().Year()
		}
	}
	var dur int
	if raw := firstTagValue(ev.Tags, "duration"); raw != "" {
		if sec, err := strconv.Atoi(raw); err == nil && sec > 0 {
			dur = sec
		}
	}
	var genres []string
	for _, tag := range matchingTags(ev.Tags, "t") {
		genres = append(genres, tag[1])
	}
	return Song{
		Event:       ev,
		ID:          ev.ID.Hex(),
		PubKey:      pub,
		CreatedAt:   int64(ev.CreatedAt),
		SongID:      dTag,
		Address:     addr,
		Title:       firstTagValue(ev.Tags, "title"),
		Artist:      artist,
		Album:       album,
		MBID:        mbid,
		ReleaseYear: year,
		Duration:    dur,
		Genres:      genres,
		AudioURL:    firstTagValue(ev.Tags, "r"),
	}, true
}

func slugify(raw string) string {
	s := nonWordRe.ReplaceAllString(strings.ToLower(raw), "-")
	s = strings.Trim(s, "-")
	if len(s) > 64 {
		s = s[:64]
	}
	return s
}

func DeriveSongID(title, artist string) string {
	slug := slugify(title + "-by-" + artist)
	if slug == "" {
		return newUUID()
	}
	return slug
}

func BuildSongEvent(title, artist string) nostr.Event {
	title = strings.TrimSpace(title)
	artist = strings.TrimSpace(artist)
	songID := DeriveSongID(title, artist)
	tags := nostr.Tags{
		{"d", songID},
		{"title", title},
	}
	if artist != "" {
		tags = append(tags, nostr.Tag{"c", artist, "artist"})
	}
	tags = append(tags, nostr.Tag{"L", "wavefunc"}, nostr.Tag{"l", "unverified"})
	return nostr.Event{
		Kind:      KindSong,
		CreatedAt: nostr.Now(),
		Content:   "",
		Tags:      tags,
	}
}

type SongList struct {
	Event         nostr.Event
	ID            string
	PubKey        string
	CreatedAt     int64
	ListID        string
	Address       string
	Name          string
	Description   string
	SongAddresses []string
}

func (l SongList) HasSong(addr string) bool {
	for _, a := range l.SongAddresses {
		if a == addr {
			return true
		}
	}
	return false
}

func ParseSongList(ev nostr.Event) (SongList, bool) {
	if ev.Kind != KindAppList || firstTagValue(ev.Tags, "l") != LabelSongList {
		return SongList{}, false
	}
	dTag := firstTagValue(ev.Tags, "d")
	name := firstTagValue(ev.Tags, "name")
	if name == "" {
		name = "Liked Songs"
	}
	var addrs []string
	for _, tag := range matchingTags(ev.Tags, "a") {
		if strings.HasPrefix(tag[1], "31337:") {
			addrs = append(addrs, tag[1])
		}
	}
	pub := ev.PubKey.Hex()
	addr := ""
	if dTag != "" && pub != "" {
		addr = fmt.Sprintf("%d:%s:%s", KindAppList, pub, dTag)
	}
	return SongList{
		Event:         ev,
		ID:            ev.ID.Hex(),
		PubKey:        pub,
		CreatedAt:     int64(ev.CreatedAt),
		ListID:        dTag,
		Address:       addr,
		Name:          name,
		Description:   firstTagValue(ev.Tags, "description"),
		SongAddresses: addrs,
	}, true
}

func BuildSongListEvent(listID, name string, songAddresses []string) nostr.Event {
	if listID == "" {
		listID = newUUID()
	}
	if strings.TrimSpace(name) == "" {
		name = "Liked Songs"
	}
	tags := nostr.Tags{
		{"d", listID},
		{"l", LabelSongList},
		{"name", name},
	}
	for _, addr := range songAddresses {
		if strings.HasPrefix(addr, "31337:") {
			tags = append(tags, nostr.Tag{"a", addr})
		}
	}
	return nostr.Event{
		Kind:      KindAppList,
		CreatedAt: nostr.Now(),
		Content:   "",
		Tags:      tags,
	}
}

func BuildSongListAddSong(ev nostr.Event, songAddress, relayHint string) nostr.Event {
	parsed, _ := ParseSongList(ev)
	if parsed.HasSong(songAddress) {
		clone := ev
		clone.CreatedAt = nostr.Now()
		return clone
	}
	tags := make(nostr.Tags, 0, len(ev.Tags)+1)
	for _, t := range ev.Tags {
		cp := make(nostr.Tag, len(t))
		copy(cp, t)
		tags = append(tags, cp)
	}
	if relayHint != "" {
		tags = append(tags, nostr.Tag{"a", songAddress, relayHint})
	} else {
		tags = append(tags, nostr.Tag{"a", songAddress})
	}
	return nostr.Event{
		Kind:      KindAppList,
		CreatedAt: nostr.Now(),
		Content:   ev.Content,
		Tags:      tags,
	}
}

func BuildSongListRemoveSong(ev nostr.Event, songAddress string) nostr.Event {
	tags := make(nostr.Tags, 0, len(ev.Tags))
	for _, t := range ev.Tags {
		if len(t) >= 2 && t[0] == "a" && t[1] == songAddress {
			continue
		}
		cp := make(nostr.Tag, len(t))
		copy(cp, t)
		tags = append(tags, cp)
	}
	return nostr.Event{
		Kind:      KindAppList,
		CreatedAt: nostr.Now(),
		Content:   ev.Content,
		Tags:      tags,
	}
}

// --- Profiles (kind 0) ---

type Profile struct {
	PubKey      string
	Name        string `json:"name"`
	DisplayName string `json:"display_name"`
	About       string `json:"about"`
	Picture     string `json:"picture"`
	NIP05       string `json:"nip05"`
}

func (p Profile) Label() string {
	if strings.TrimSpace(p.DisplayName) != "" {
		return strings.TrimSpace(p.DisplayName)
	}
	if strings.TrimSpace(p.Name) != "" {
		return strings.TrimSpace(p.Name)
	}
	if len(p.PubKey) >= 10 {
		return p.PubKey[:8] + "…"
	}
	return "anon"
}

func ParseProfile(ev nostr.Event) (Profile, bool) {
	if ev.Kind != KindProfile {
		return Profile{}, false
	}
	var p Profile
	_ = json.Unmarshal([]byte(ev.Content), &p)
	p.PubKey = ev.PubKey.Hex()
	return p, true
}

func BuildProfileEvent(name, about string) nostr.Event {
	payload := map[string]string{
		"name":         strings.TrimSpace(name),
		"display_name": strings.TrimSpace(name),
		"about":        strings.TrimSpace(about),
	}
	raw, _ := json.Marshal(payload)
	return nostr.Event{
		Kind:      KindProfile,
		CreatedAt: nostr.Now(),
		Content:   string(raw),
		Tags:      nostr.Tags{},
	}
}

// --- Social: Reactions (kind 7), NIP-22 Comments (kind 1111), Assembly (kind 1) ---

func BuildStationReaction(station Station, emoji string) nostr.Event {
	if emoji == "" {
		emoji = "❤️"
	}
	tags := nostr.Tags{}
	if station.Address != "" {
		tags = append(tags, nostr.Tag{"a", station.Address})
	}
	tags = append(tags,
		nostr.Tag{"e", station.ID},
		nostr.Tag{"p", station.PubKey},
		nostr.Tag{"k", strconv.Itoa(int(KindStation))},
	)
	return nostr.Event{
		Kind:      KindReaction,
		CreatedAt: nostr.Now(),
		Content:   emoji,
		Tags:      tags,
	}
}

func BuildNoteReaction(target nostr.Event, emoji string) nostr.Event {
	if emoji == "" {
		emoji = "❤️"
	}
	return nostr.Event{
		Kind:      KindReaction,
		CreatedAt: nostr.Now(),
		Content:   emoji,
		Tags: nostr.Tags{
			{"e", target.ID.Hex()},
			{"p", target.PubKey.Hex()},
			{"k", strconv.Itoa(int(target.Kind))},
			{"t", CommunityTopic},
		},
	}
}

func BuildStationComment(station Station, content string) nostr.Event {
	tags := nostr.Tags{}
	if station.Address != "" {
		tags = append(tags,
			nostr.Tag{"A", station.Address},
			nostr.Tag{"E", station.ID},
			nostr.Tag{"K", strconv.Itoa(int(KindStation))},
			nostr.Tag{"P", station.PubKey},
			nostr.Tag{"a", station.Address},
			nostr.Tag{"e", station.ID},
			nostr.Tag{"k", strconv.Itoa(int(KindStation))},
			nostr.Tag{"p", station.PubKey},
		)
	} else {
		tags = append(tags,
			nostr.Tag{"E", station.ID},
			nostr.Tag{"K", strconv.Itoa(int(KindStation))},
			nostr.Tag{"P", station.PubKey},
			nostr.Tag{"e", station.ID},
			nostr.Tag{"k", strconv.Itoa(int(KindStation))},
			nostr.Tag{"p", station.PubKey},
		)
	}
	return nostr.Event{
		Kind:      KindComment,
		CreatedAt: nostr.Now(),
		Content:   strings.TrimSpace(content),
		Tags:      tags,
	}
}

func BuildCommentReply(parent nostr.Event, station Station, content string) nostr.Event {
	tags := nostr.Tags{}
	if station.Address != "" {
		tags = append(tags, nostr.Tag{"A", station.Address})
	}
	tags = append(tags,
		nostr.Tag{"E", station.ID},
		nostr.Tag{"K", strconv.Itoa(int(KindStation))},
		nostr.Tag{"P", station.PubKey},
		nostr.Tag{"e", parent.ID.Hex()},
		nostr.Tag{"k", strconv.Itoa(int(KindComment))},
		nostr.Tag{"p", parent.PubKey.Hex()},
	)
	return nostr.Event{
		Kind:      KindComment,
		CreatedAt: nostr.Now(),
		Content:   strings.TrimSpace(content),
		Tags:      tags,
	}
}

type CommentNode struct {
	Event    nostr.Event
	Depth    int
	Children []*CommentNode
}

func commentParentID(ev nostr.Event, rootEventID string) string {
	parentKind := firstTagValue(ev.Tags, "k")
	if parentKind == strconv.Itoa(int(KindStation)) {
		return ""
	}
	if parentKind == strconv.Itoa(int(KindComment)) {
		if id := firstTagValue(ev.Tags, "e"); id != "" && id != rootEventID {
			return id
		}
	}
	// Legacy fallback: NIP-10 reply marker or non-root e tag.
	for _, tag := range ev.Tags {
		if len(tag) >= 4 && tag[0] == "e" && tag[3] == "reply" && tag[1] != rootEventID {
			return tag[1]
		}
	}
	for _, tag := range ev.Tags {
		if len(tag) >= 2 && tag[0] == "e" && (len(tag) < 4 || tag[3] != "root") && tag[1] != rootEventID {
			return tag[1]
		}
	}
	return ""
}

// BuildCommentTree constructs a cycle-safe threaded tree matching comment-tree.ts.
func BuildCommentTree(events []nostr.Event, rootEventID string) []*CommentNode {
	byID := make(map[string]nostr.Event, len(events))
	for _, ev := range events {
		byID[ev.ID.Hex()] = ev
	}
	ordered := make([]nostr.Event, 0, len(byID))
	for _, ev := range byID {
		ordered = append(ordered, ev)
	}
	sort.Slice(ordered, func(i, j int) bool {
		if ordered[i].CreatedAt != ordered[j].CreatedAt {
			return ordered[i].CreatedAt > ordered[j].CreatedAt
		}
		return ordered[i].ID.Hex() < ordered[j].ID.Hex()
	})

	children := make(map[string][]nostr.Event)
	var roots []nostr.Event
	for _, ev := range ordered {
		id := ev.ID.Hex()
		parent := commentParentID(ev, rootEventID)
		if parent == "" || parent == id {
			roots = append(roots, ev)
			continue
		}
		if _, exists := byID[parent]; !exists {
			roots = append(roots, ev)
			continue
		}
		children[parent] = append(children[parent], ev)
	}

	visited := make(map[string]bool)
	var build func(ev nostr.Event, depth int) *CommentNode
	build = func(ev nostr.Event, depth int) *CommentNode {
		id := ev.ID.Hex()
		visited[id] = true
		node := &CommentNode{Event: ev, Depth: depth}
		kids := children[id]
		// Replies ordered oldest-first within a thread.
		for i := len(kids) - 1; i >= 0; i-- {
			kid := kids[i]
			if depth < 32 && !visited[kid.ID.Hex()] {
				node.Children = append(node.Children, build(kid, depth+1))
			}
		}
		return node
	}

	var result []*CommentNode
	for _, ev := range roots {
		if !visited[ev.ID.Hex()] {
			result = append(result, build(ev, 0))
		}
	}
	// Capture any events trapped in malformed cycles so nothing is silently hidden.
	for _, ev := range ordered {
		if !visited[ev.ID.Hex()] {
			result = append(result, build(ev, 0))
		}
	}
	return result
}

// FlattenComments flattens a comment tree in display order.
func FlattenComments(nodes []*CommentNode) []*CommentNode {
	var out []*CommentNode
	var walk func([]*CommentNode)
	walk = func(list []*CommentNode) {
		for _, n := range list {
			out = append(out, n)
			walk(n.Children)
		}
	}
	walk(nodes)
	return out
}

type CommunityPost struct {
	Event         nostr.Event
	ID            string
	PubKey        string
	CreatedAt     int64
	Content       string
	Categories    []string
	IsReply       bool
	ParentEventID string
	RootEventID   string
}

func ParseCommunityPost(ev nostr.Event) CommunityPost {
	var cats []string
	for _, tag := range matchingTags(ev.Tags, "t") {
		if tag[1] != CommunityTopic && tag[1] != "" {
			cats = append(cats, tag[1])
		}
	}
	var rootID, replyID, fallbackID string
	for _, tag := range ev.Tags {
		if len(tag) >= 2 && tag[0] == "e" {
			if len(tag) >= 4 {
				if tag[3] == "root" && rootID == "" {
					rootID = tag[1]
				} else if tag[3] == "reply" && replyID == "" {
					replyID = tag[1]
				}
			}
			if fallbackID == "" {
				fallbackID = tag[1]
			}
		}
	}
	parentID := replyID
	if parentID == "" {
		parentID = rootID
	}
	if parentID == "" {
		parentID = fallbackID
	}
	if rootID == "" {
		rootID = parentID
	}
	return CommunityPost{
		Event:         ev,
		ID:            ev.ID.Hex(),
		PubKey:        ev.PubKey.Hex(),
		CreatedAt:     int64(ev.CreatedAt),
		Content:       ev.Content,
		Categories:    cats,
		IsReply:       parentID != "" || ev.Kind == KindComment,
		ParentEventID: parentID,
		RootEventID:   rootID,
	}
}

func BuildCommunityPost(content, category string) nostr.Event {
	tags := nostr.Tags{{"t", CommunityTopic}}
	category = strings.TrimSpace(strings.ToLower(category))
	if category != "" && category != "general" {
		tags = append(tags, nostr.Tag{"t", category})
	}
	return nostr.Event{
		Kind:      KindNote,
		CreatedAt: nostr.Now(),
		Content:   strings.TrimSpace(content),
		Tags:      tags,
	}
}

func BuildCommunityReply(parent CommunityPost, content string) nostr.Event {
	rootID := parent.RootEventID
	if rootID == "" {
		rootID = parent.ID
	}
	tags := nostr.Tags{
		{"t", CommunityTopic},
		{"e", rootID, "", "root"},
	}
	if parent.ID != rootID {
		tags = append(tags, nostr.Tag{"e", parent.ID, "", "reply"})
	}
	tags = append(tags, nostr.Tag{"p", parent.PubKey})
	return nostr.Event{
		Kind:      KindNote,
		CreatedAt: nostr.Now(),
		Content:   strings.TrimSpace(content),
		Tags:      tags,
	}
}

// --- NIP-38 Listening Status (kind 30315) ---

type ListeningTrack struct {
	Title   string
	Artist  string
	Address string
	URL     string
}

func BuildListeningStatusEvent(track *ListeningTrack, now int64) nostr.Event {
	if now == 0 {
		now = time.Now().Unix()
	}
	content := ""
	tags := nostr.Tags{
		{"d", "music"},
		{"expiration", strconv.FormatInt(now+300, 10)},
	}
	if track != nil {
		parts := []string{}
		if strings.TrimSpace(track.Artist) != "" {
			parts = append(parts, strings.TrimSpace(track.Artist))
		}
		if strings.TrimSpace(track.Title) != "" {
			parts = append(parts, strings.TrimSpace(track.Title))
		}
		content = strings.Join(parts, " - ")
		if len(content) > 300 {
			content = content[:300]
		}
		if track.URL != "" {
			tags = append(tags, nostr.Tag{"r", track.URL})
		}
		if track.Address != "" {
			tags = append(tags, nostr.Tag{"a", track.Address})
		}
	}
	return nostr.Event{
		Kind:      KindListeningStatus,
		CreatedAt: nostr.Timestamp(now),
		Content:   content,
		Tags:      tags,
	}
}
