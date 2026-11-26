package nostrclient

import (
	"context"
	"os"
	"slices"
	"testing"
	"time"

	"fiatjaf.com/nostr"
)

func TestParseStationTagAndContentStreams(t *testing.T) {
	pk := nostr.Generate().Public()
	ev := nostr.Event{
		ID:        nostr.ID{1},
		PubKey:    pk,
		CreatedAt: 1700000000,
		Kind:      KindStation,
		Content:   `{"description":"Fallback desc","streams":[{"url":"https://content.example/stream.mp3","format":"audio/mpeg","quality":{"bitrate":128000,"codec":"mp3","sampleRate":44100}}]}`,
		Tags: nostr.Tags{
			{"d", "fip-radio"},
			{"name", "FIP Radio"},
			{"description", "Tag desc"},
			{"country", "fr"},
			{"c", "jazz", "genre"},
			{"c", "electronic", "genre"},
			{"l", "fr"},
			{"stream", "`https://icecast.radiofrance.fr/fip-hifi.aac`", "audio/aac", `{"bitrate":192000,"codec":"aac","sampleRate":44100}`, "primary"},
		},
	}

	st, ok := ParseStation(ev)
	if !ok {
		t.Fatal("expected station to parse")
	}
	if st.Name != "FIP Radio" || st.CountryCode != "FR" || st.Description != "Tag desc" {
		t.Fatalf("unexpected station fields: %+v", st)
	}
	if len(st.Streams) != 1 || st.Streams[0].URL != "https://icecast.radiofrance.fr/fip-hifi.aac" || !st.Streams[0].Primary {
		t.Fatalf("expected tag stream to win and strip backticks: %+v", st.Streams)
	}
	if st.QualityBadge() != "192k AAC" {
		t.Fatalf("unexpected badge: %q", st.QualityBadge())
	}
	if !MatchesStationSearch(st, "fip jazz") || MatchesStationSearch(st, "fip metal") {
		t.Fatal("search tokenization mismatch")
	}
}

func TestRelayPolicyRouting(t *testing.T) {
	prod := NewRelayPolicy(ProdAppRelay)
	if prod.Stage != StageProduction {
		t.Fatalf("expected production stage, got %s", prod.Stage)
	}

	// Favorites list -> app relay ONLY.
	fav := BuildFavoritesListEvent("list-1", "My Favs", "", []string{"31237:abc:fip"})
	favRelays := SelectPublishRelays(prod, fav, []string{"wss://user.outbox"}, nil)
	if len(favRelays) != 1 || favRelays[0] != ProdAppRelay {
		t.Fatalf("expected fav list on app relay only, got %v", favRelays)
	}

	// Profile (kind 0) -> must NOT route to app relay.
	prof := BuildProfileEvent("alice", "radio fan")
	profRelays := SelectPublishRelays(prod, prof, nil, nil)
	if slices.Contains(profRelays, ProdAppRelay) {
		t.Fatalf("kind 0 must never route to wavefunc app relay: %v", profRelays)
	}
	if !slices.Contains(profRelays, DefaultIdentityRelays[0]) {
		t.Fatalf("kind 0 should include identity relays: %v", profRelays)
	}

	// NIP-38 listening status -> must NOT route to app relay.
	status := BuildListeningStatusEvent(&ListeningTrack{Title: "Blue in Green", Artist: "Miles Davis"}, 1700000000)
	statusRelays := SelectPublishRelays(prod, status, []string{"wss://outbox.example"}, nil)
	if slices.Contains(statusRelays, ProdAppRelay) {
		t.Fatalf("kind 30315 must not route to app relay: %v", statusRelays)
	}

	// Community #wavefunc note -> app relay + general/outbox.
	note := BuildCommunityPost("Hello terminal!", "greeting")
	noteRelays := SelectPublishRelays(prod, note, nil, nil)
	if !slices.Contains(noteRelays, ProdAppRelay) {
		t.Fatalf("#wavefunc note must include app relay: %v", noteRelays)
	}

	// Dev relay stays isolated to localhost.
	dev := NewRelayPolicy("ws://localhost:3334")
	if dev.Stage != StageDevelopment {
		t.Fatalf("expected development stage, got %s", dev.Stage)
	}
	devRelays := SelectPublishRelays(dev, prof, []string{"wss://relay.damus.io"}, nil)
	if len(devRelays) != 1 || devRelays[0] != "ws://localhost:3334" {
		t.Fatalf("dev stage leaked external relays: %v", devRelays)
	}
}

func TestStationHealthExpiration(t *testing.T) {
	ev := nostr.Event{
		Kind:    KindStationHealth,
		Content: `{"stationAddress":"31237:abc:fip","status":"up","score":98,"checkedAt":1000,"latencyMs":120,"consecutiveFailures":0,"insecure":false}`,
		Tags: nostr.Tags{
			{"d", "31237:abc:fip"},
			{"a", "31237:abc:fip"},
			{"expiration", "2000"},
		},
	}
	if _, ok := ParseStationHealth(ev, 2500); ok {
		t.Fatal("expected expired health event to be ignored")
	}
	h, ok := ParseStationHealth(ev, 1500)
	if !ok || h.Status != "up" || h.Score != 98 {
		t.Fatalf("unexpected health parse: ok=%v h=%+v", ok, h)
	}
}

func TestFavoritesAndSongBuilders(t *testing.T) {
	pk := nostr.Generate().Public()
	favEv := BuildFavoritesListEvent("my-list", "Late Night", "Chill", []string{"31237:abc:one"})
	favEv.PubKey = pk
	favEv = BuildFavoritesAddStation(favEv, "31237:abc:two", ProdAppRelay)
	favEv.PubKey = pk

	parsed, ok := ParseFavoritesList(favEv)
	if !ok || len(parsed.StationAddresses) != 2 || !parsed.HasStation("31237:abc:two") {
		t.Fatalf("unexpected favorites list: ok=%v parsed=%+v", ok, parsed)
	}

	removed := BuildFavoritesRemoveStation(favEv, "31237:abc:one")
	removed.PubKey = pk
	parsedRemoved, _ := ParseFavoritesList(removed)
	if len(parsedRemoved.StationAddresses) != 1 || parsedRemoved.HasStation("31237:abc:one") {
		t.Fatalf("expected removal to drop station one: %+v", parsedRemoved.StationAddresses)
	}

	songEv := BuildSongEvent("Kind of Blue", "Miles Davis")
	songEv.PubKey = pk
	song, ok := ParseSong(songEv)
	if !ok || song.Title != "Kind of Blue" || song.Artist != "Miles Davis" || song.SongID != "kind-of-blue-by-miles-davis" {
		t.Fatalf("unexpected parsed song: ok=%v song=%+v", ok, song)
	}
}

func TestBuildCommentTreeCyclesAndOrphans(t *testing.T) {
	idA := nostr.ID{1}
	idB := nostr.ID{2}
	idC := nostr.ID{3}
	rootStationID := nostr.ID{9}.Hex()

	// A <-> B malformed cycle + C orphaned child.
	evA := nostr.Event{
		ID:        idA,
		Kind:      KindComment,
		CreatedAt: 100,
		Content:   "A",
		Tags:      nostr.Tags{{"e", idB.Hex()}, {"k", "1111"}},
	}
	evB := nostr.Event{
		ID:        idB,
		Kind:      KindComment,
		CreatedAt: 200,
		Content:   "B",
		Tags:      nostr.Tags{{"e", idA.Hex()}, {"k", "1111"}},
	}
	evC := nostr.Event{
		ID:        idC,
		Kind:      KindComment,
		CreatedAt: 300,
		Content:   "Orphan",
		Tags:      nostr.Tags{{"e", nostr.ID{99}.Hex()}, {"k", "1111"}},
	}

	tree := BuildCommentTree([]nostr.Event{evA, evB, evC}, rootStationID)
	flat := FlattenComments(tree)
	if len(flat) != 3 {
		t.Fatalf("expected all 3 comments preserved without infinite loop, got %d", len(flat))
	}
}

func TestLiveProductionRelaySmoke(t *testing.T) {
	if os.Getenv("WF_LIVE_SMOKE") != "1" {
		t.Skip("set WF_LIVE_SMOKE=1 to run live read-only check against wss://relay.wavefunc.live")
	}
	client := NewClient(ProdAppRelay)
	defer client.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	count, err := client.FetchStationCount(ctx)
	if err != nil || count == 0 {
		t.Fatalf("FetchStationCount failed: count=%d err=%v", count, err)
	}
	t.Logf("live station count: %d", count)

	stations, err := client.FetchStations(ctx, StationQuery{Search: "jazz", Limit: 10})
	if err != nil || len(stations) == 0 {
		t.Fatalf("FetchStations(jazz) failed: len=%d err=%v", len(stations), err)
	}
	t.Logf("jazz search returned %d stations (first: %s)", len(stations), stations[0].Name)

	addrs := make([]string, 0, len(stations))
	for _, st := range stations {
		addrs = append(addrs, st.Address)
	}
	health, tracks := client.FetchHealthBatch(ctx, addrs)
	t.Logf("health batch: %d health summaries, %d live tracks", len(health), len(tracks))

	discover, err := client.FetchDiscover(ctx)
	if err != nil {
		t.Fatalf("FetchDiscover failed: %v", err)
	}
	t.Logf("discover: %d featured lists, %d charts, %d stations", len(discover.FeaturedLists), len(discover.Rankings), len(discover.Stations))

	discAddrs := make([]string, 0, len(discover.Stations))
	for addr := range discover.Stations {
		discAddrs = append(discAddrs, addr)
	}
	discHealth, discTracks := client.FetchHealthBatch(ctx, discAddrs)
	t.Logf("discover health batch: %d health summaries, %d live tracks", len(discHealth), len(discTracks))
}
