package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"iter"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"time"

	bleve "github.com/blevesearch/bleve/v2"
	bleveMapping "github.com/blevesearch/bleve/v2/mapping"
	bleveQuery "github.com/blevesearch/bleve/v2/search/query"

	"fiatjaf.com/nostr"
	"fiatjaf.com/nostr/eventstore"
	"fiatjaf.com/nostr/eventstore/lmdb"
	"fiatjaf.com/nostr/khatru"
	"fiatjaf.com/nostr/khatru/policies"
	"fiatjaf.com/nostr/nip11"
)

var (
	host       = flag.String("host", "127.0.0.1", "Host address to bind (use 0.0.0.0 only for isolated development)")
	port       = flag.String("port", "3334", "Port to listen on")
	dbPath     = flag.String("db-path", "./data/events", "Path to LMDB database directory")
	searchPath = flag.String("search-path", "./data/search", "Path to bleve search index")
	resetDB    = flag.Bool("reset-db", false, "Reset the database")
	resetIndex = flag.Bool("reset-index", false, "Reset the search index")
	resetAll   = flag.Bool("reset-all", false, "Reset both database and index")
	reindex    = flag.Bool("reindex", false, "Rebuild search index from existing LMDB data then exit")
)

const (
	productionMetadataServerPubKey = "bb0707242a17a4be881919b3dcfea63f42aacedc3ff898a66be30af195ff32b2"
	maxPublicIDs                   = 20
	maxPublicAuthors               = 100
	maxPublicTagValues             = 200
	maxPublicSubscriptions         = 24
)

var publicReadableKinds = map[nostr.Kind]struct{}{
	1: {}, 5: {}, 7: {}, 1059: {}, 1111: {}, 1985: {}, 9321: {}, 9735: {},
	21059: {}, 24133: {}, 25910: {}, 30078: {}, 31237: {}, 31238: {},
	31239: {}, 31240: {}, 31337: {},
}

var contextVMTransportKinds = map[nostr.Kind]struct{}{
	1059: {}, 21059: {}, 25910: {},
}

func envEnabled(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

func containsKind(kinds []nostr.Kind, wanted nostr.Kind) bool {
	for _, kind := range kinds {
		if kind == wanted {
			return true
		}
	}
	return false
}

func allKindsIn(kinds []nostr.Kind, allowed map[nostr.Kind]struct{}) bool {
	for _, kind := range kinds {
		if _, ok := allowed[kind]; !ok {
			return false
		}
	}
	return true
}

func allowedWaveFuncLabel(value string) bool {
	return value == "wavefunc_user_favourite_list" ||
		value == "wavefunc_user_song_list" ||
		strings.HasPrefix(value, "wavefunc:featured:")
}

func filterHasTag(filter nostr.Filter, name string) bool {
	return len(filter.Tags[name]) > 0
}

func filterHasTagValue(filter nostr.Filter, name string, allowed ...string) bool {
	for _, value := range filter.Tags[name] {
		for _, candidate := range allowed {
			if value == candidate {
				return true
			}
		}
	}
	return false
}

func hasPublicSocialTarget(filter nostr.Filter) bool {
	return filterHasTag(filter, "a") || filterHasTag(filter, "A") ||
		filterHasTag(filter, "e") || filterHasTag(filter, "p") ||
		filterHasTag(filter, "t")
}

func isRecentFilter(filter nostr.Filter) bool {
	if filter.Since == 0 {
		return false
	}
	now := nostr.Now()
	return filter.Since >= now-nostr.Timestamp(7*24*60*60) &&
		filter.Since <= now+nostr.Timestamp(5*60)
}

// rejectPublicFilter keeps the public endpoint specialized to WaveFunc data.
// Development stays permissive through RELAY_POLICY_MODE; this validator is
// only installed by the production deployment.
func rejectPublicFilter(_ context.Context, filter nostr.Filter) (bool, string) {
	if filter.Limit > 500 {
		return true, "restricted: limit must not exceed 500"
	}
	if len(filter.IDs) > maxPublicIDs {
		return true, "restricted: too many event ids"
	}
	if len(filter.Authors) > maxPublicAuthors {
		return true, "restricted: too many authors"
	}
	if len(filter.Kinds) > 8 {
		return true, "restricted: too many kinds"
	}
	if len(filter.Tags) > 8 {
		return true, "restricted: too many tag filters"
	}
	for _, values := range filter.Tags {
		if len(values) > maxPublicTagValues {
			return true, "restricted: too many tag values"
		}
	}

	// IDs-only resolution is needed for Nostr pointers and deep links. LMDB's
	// ID fast path ignores result limits, hence the small hard cap above.
	if len(filter.Kinds) == 0 {
		if len(filter.IDs) > 0 && len(filter.Authors) == 0 && len(filter.Tags) == 0 {
			return false, ""
		}
		return true, "restricted: explicit WaveFunc kinds are required"
	}
	if !allKindsIn(filter.Kinds, publicReadableKinds) {
		return true, "restricted: this is a specialized WaveFunc relay"
	}

	if filter.Search != "" {
		query := strings.TrimSpace(filter.Search)
		if len(filter.Kinds) != 1 || filter.Kinds[0] != indexedKind || len(query) < 2 || len(query) > 80 {
			return true, "restricted: search is only available for stations"
		}
	}

	if allKindsIn(filter.Kinds, contextVMTransportKinds) {
		if len(filter.Tags["p"]) != 1 || !isRecentFilter(filter) || filter.Limit > 100 {
			return true, "restricted: ContextVM requests must be targeted and recent"
		}
		return false, ""
	}
	for _, kind := range filter.Kinds {
		if _, isTransport := contextVMTransportKinds[kind]; isTransport {
			return true, "restricted: transport and application filters cannot be mixed"
		}
	}

	if containsKind(filter.Kinds, 24133) {
		if len(filter.Kinds) != 1 || len(filter.Tags["p"]) != 1 || !isRecentFilter(filter) || filter.Limit > 10 {
			return true, "restricted: NIP-46 requests must be targeted and recent"
		}
	}

	if containsKind(filter.Kinds, 30078) {
		labels := filter.Tags["l"]
		if len(labels) == 0 {
			return true, "restricted: WaveFunc lists require an application label"
		}
		for _, label := range labels {
			if !allowedWaveFuncLabel(label) {
				return true, "restricted: unknown application list label"
			}
		}
	}

	for _, kind := range []nostr.Kind{31238, 31239} {
		if containsKind(filter.Kinds, kind) &&
			(len(filter.Authors) != 1 || len(filter.Tags["a"]) == 0) {
			return true, "restricted: observations require an author and station targets"
		}
	}
	if containsKind(filter.Kinds, 31240) && len(filter.Authors) != 1 {
		return true, "restricted: rankings require the observer author"
	}

	if containsKind(filter.Kinds, 1) &&
		!filterHasTagValue(filter, "t", "wavefunc", "tunestr") {
		return true, "restricted: text notes must be WaveFunc-tagged"
	}
	for _, kind := range []nostr.Kind{5, 7, 1111, 1985, 9321, 9735} {
		if containsKind(filter.Kinds, kind) && !hasPublicSocialTarget(filter) {
			return true, "restricted: social events require a WaveFunc target"
		}
	}

	return false, ""
}

func eventHasTagValue(event nostr.Event, name string, values ...string) bool {
	for _, tag := range event.Tags {
		if len(tag) < 2 || tag[0] != name {
			continue
		}
		for _, value := range values {
			if tag[1] == value {
				return true
			}
		}
	}
	return false
}

func eventHasTag(event nostr.Event, name string) bool {
	for _, tag := range event.Tags {
		if len(tag) >= 2 && tag[0] == name && tag[1] != "" {
			return true
		}
	}
	return false
}

func eventTargetsWaveFunc(event nostr.Event) bool {
	for _, tag := range event.Tags {
		if len(tag) < 2 {
			continue
		}
		if (tag[0] == "a" || tag[0] == "A") &&
			(strings.HasPrefix(tag[1], "31237:") ||
				strings.HasPrefix(tag[1], "31337:") ||
				strings.HasPrefix(tag[1], "30078:")) {
			return true
		}
	}
	return eventHasTagValue(event, "t", "wavefunc", "tunestr") ||
		(eventHasTag(event, "e") && eventHasTagValue(event, "k", "1", "31237", "31337", "30078"))
}

func rejectPublicEvent(metadataAuthor nostr.PubKey) func(context.Context, nostr.Event) (bool, string) {
	return func(_ context.Context, event nostr.Event) (bool, string) {
		switch event.Kind {
		case 31237, 31337:
			return false, ""
		case 31238, 31239, 31240:
			if event.PubKey == metadataAuthor {
				return false, ""
			}
			return true, "restricted: observer events require the configured signer"
		case 30078:
			for _, tag := range event.Tags {
				if len(tag) >= 2 && tag[0] == "l" && allowedWaveFuncLabel(tag[1]) {
					if strings.HasPrefix(tag[1], "wavefunc:featured:") &&
						event.PubKey.Hex() != "210f31b6019f5ae13c995c8d83faa41a129f1296842e4c3313ab8a4abb09d1a2" {
						return true, "restricted: featured lists require an administrator"
					}
					return false, ""
				}
			}
			return true, "restricted: unknown application list"
		case 1:
			if eventHasTagValue(event, "t", "wavefunc", "tunestr") {
				return false, ""
			}
		case 7, 1111, 9321, 9735:
			if eventTargetsWaveFunc(event) {
				return false, ""
			}
		case 1985:
			if eventHasTagValue(event, "L", "wavefunc.station-status") &&
				eventTargetsWaveFunc(event) {
				return false, ""
			}
		case 5:
			if eventTargetsWaveFunc(event) || eventHasTagValue(event, "k", "31237", "31337", "30078") {
				return false, ""
			}
		case 1059, 21059, 24133, 25910:
			if eventHasTag(event, "p") {
				return false, ""
			}
		}
		return true, fmt.Sprintf("restricted: event kind %d is not WaveFunc-scoped", event.Kind)
	}
}

func rejectPublicCount(_ context.Context, filter nostr.Filter) (bool, string) {
	if isStationOnlyCountFilter(filter) {
		return false, ""
	}
	return true, "restricted: only station COUNT is supported"
}

func isLoopbackRequest(ctx context.Context) bool {
	ip := net.ParseIP(khatru.GetIP(ctx))
	return ip != nil && ip.IsLoopback()
}

func isLocalObserverEvidenceFilter(filter nostr.Filter) bool {
	if len(filter.Kinds) == 0 || len(filter.IDs) > 0 || len(filter.Authors) > 0 ||
		len(filter.Tags) > 0 || filter.Search != "" {
		return false
	}
	for _, kind := range filter.Kinds {
		if kind != 7 && kind != 9735 && kind != 9321 && kind != 1985 {
			return false
		}
	}
	return true
}

func externalPublicFilterPolicy(ctx context.Context, filter nostr.Filter) (bool, string) {
	reject, reason := rejectPublicFilter(ctx, filter)
	if reject && isLoopbackRequest(ctx) && isLocalObserverEvidenceFilter(filter) {
		return false, ""
	}
	return reject, reason
}

func subscriptionLimitPolicy(relay *khatru.Relay, max int) func(context.Context, nostr.Filter) (bool, string) {
	return func(ctx context.Context, _ nostr.Filter) (bool, string) {
		connection := khatru.GetConnection(ctx)
		if connection == nil {
			return false, ""
		}
		if snapshot, ok := relay.GetClientSnapshot(connection.GetID()); ok && snapshot.SubscriptionCount >= max {
			return true, "rate-limited: too many active subscriptions"
		}
		return false, ""
	}
}

func publicQueryLimit(ctx context.Context, filter nostr.Filter) int {
	if isLoopbackRequest(ctx) {
		return 100_000
	}
	if len(filter.IDs) > 0 {
		return maxPublicIDs
	}
	if containsKind(filter.Kinds, 31237) {
		return 500
	}
	if containsKind(filter.Kinds, 31238) || containsKind(filter.Kinds, 31239) ||
		containsKind(filter.Kinds, 1111) {
		return 500
	}
	return 200
}

// stationSearch is a custom bleve search index with:
//   - Station-aware indexing: indexes "name description" as searchable content
//   - Prefix+match querying: "enall" matches "Enallax Radio"
type stationSearch struct {
	path     string
	rawStore eventstore.Store
	index    bleve.Index
}

func newStationSearch(path string, rawStore eventstore.Store) *stationSearch {
	return &stationSearch{path: path, rawStore: rawStore}
}

func (s *stationSearch) Init() error {
	idx, err := bleve.Open(s.path)
	if err == bleve.ErrorIndexPathDoesNotExist {
		// Fresh start: directory doesn't exist yet
		mapping := bleveMapping.NewIndexMapping()
		idx, err = bleve.New(s.path, mapping)
		if err != nil {
			return fmt.Errorf("error creating bleve index: %w", err)
		}
	} else if err != nil {
		// Index is corrupted or in an incompatible format (e.g. old bluge data).
		// Wipe and recreate rather than crashing — stations will be re-indexed
		// on the next migration run.
		log.Printf("⚠️  Search index unreadable (%v), recreating from scratch...", err)
		if removeErr := os.RemoveAll(s.path); removeErr != nil {
			return fmt.Errorf("could not remove bad search index: %w", removeErr)
		}
		mapping := bleveMapping.NewIndexMapping()
		idx, err = bleve.New(s.path, mapping)
		if err != nil {
			return fmt.Errorf("error creating bleve index after reset: %w", err)
		}
		log.Println("✅ Fresh search index created — run migration to re-populate")
	}
	s.index = idx
	return nil
}

func (s *stationSearch) Close() {
	if s.index != nil {
		s.index.Close()
	}
}

// indexedKind is the only event kind whose content we search via NIP-50.
// Everything else (notes, zaps, gift wraps, etc.) is stored in LMDB but kept
// out of bleve — it would only bloat the index and slow reindex without ever
// being searched.
const indexedKind = nostr.Kind(31237)

// buildSearchDoc produces the bleve document for a kind-31237 (radio station)
// event. Doc fields:
//   - "c": searchable text content — name + description + genre tag values
//   - "p": author pubkey (hex), for optional author filtering
//   - "t": created_at as a float64, for optional since/until range filtering
//
// We no longer need a "k" field since only one kind is ever indexed.
func buildSearchDoc(evt nostr.Event) map[string]any {
	name := ""
	if tag := evt.Tags.Find("name"); tag != nil {
		name = tag[1]
	}
	var parsed struct {
		Description string `json:"description"`
	}
	description := ""
	if err := json.Unmarshal([]byte(evt.Content), &parsed); err == nil {
		description = parsed.Description
	}
	// Include genre tag values so searches like "ambient" or "drone" match
	// stations where those words appear only in the "c" genre tags.
	var genreParts []string
	for tag := range evt.Tags.FindAll("c") {
		if len(tag) >= 2 {
			genreParts = append(genreParts, tag[1])
		}
	}
	content := strings.TrimSpace(name + " " + description + " " + strings.Join(genreParts, " "))

	return map[string]any{
		"c": content,
		"p": evt.PubKey.Hex(),
		"t": float64(evt.CreatedAt),
	}
}

// SaveEvent only indexes radio stations (kind 31237). All other kinds stay in
// LMDB only — no bleve write, no search hit.
func (s *stationSearch) SaveEvent(evt nostr.Event) error {
	if evt.Kind != indexedKind {
		return nil
	}
	return s.index.Index(evt.ID.Hex(), buildSearchDoc(evt))
}

func (s *stationSearch) DeleteEvent(id nostr.ID) error {
	// Best-effort delete; if the ID isn't in the index (because it wasn't a
	// station event) bleve returns nil anyway.
	return s.index.Delete(id.Hex())
}

// ReplaceEvent indexes the new event and optionally removes one specific stale
// bleve doc. The caller supplies `priorID`, which is the LMDB-resident event
// ID for this {kind, pubkey, d} coordinate captured *before* the LMDB replace
// ran (so it points at the version about to be evicted). For non-station
// kinds this is a no-op.
//
// We do NOT do a broad pubkey-wide bleve sweep here — that approach scaled
// badly and the delete-on-missing-LMDB pattern was self-destructing the index
// under any LMDB read hiccup. Drift across the whole author space is the
// reindex's job.
func (s *stationSearch) ReplaceEvent(evt nostr.Event, priorID nostr.ID) error {
	if evt.Kind != indexedKind {
		return nil
	}
	// Index the new event.
	if err := s.index.Index(evt.ID.Hex(), buildSearchDoc(evt)); err != nil {
		return err
	}
	// Drop the previous bleve doc for this coordinate, if there was one and it
	// differs from what we just indexed. Anything wrong here is best-effort.
	if priorID != evt.ID && !isZeroID(priorID) {
		_ = s.index.Delete(priorID.Hex())
	}
	return nil
}

func isZeroID(id nostr.ID) bool {
	for _, b := range id {
		if b != 0 {
			return false
		}
	}
	return true
}

func newKeywordTermQuery(field, value string) bleveQuery.Query {
	tq := bleve.NewTermQuery(value)
	tq.SetField(field)
	return tq
}

func mustID(hex string) nostr.ID {
	id, _ := nostr.IDFromHex(hex)
	return id
}

// isStationOnlyCountFilter detects the cheap fast-path: a filter whose
// only effective constraint is "kind = 31237". For that exact shape we
// answer NIP-45 COUNT in O(1) from bleve's DocCount(). Any extra
// authors/ids/tags/since/until/search forces the LMDB iteration path.
func isStationOnlyCountFilter(f nostr.Filter) bool {
	if len(f.Kinds) != 1 || f.Kinds[0] != indexedKind {
		return false
	}
	if len(f.IDs) != 0 || len(f.Authors) != 0 {
		return false
	}
	if len(f.Tags) != 0 {
		return false
	}
	if f.Since != 0 || f.Until != 0 {
		return false
	}
	if f.Search != "" {
		return false
	}
	return true
}

// QueryEvents searches the index. For each whitespace-separated term it builds
// a (MatchQuery OR PrefixQuery) so that partial words like "enall" match
// "enallax". All terms must match (AND between terms). The index only ever
// holds kind-31237 events, so we don't need a kind conjunct — but we still
// honor Authors and Since/Until from the nostr filter.
//
// If the caller's filter has Kinds set and *doesn't* include 31237, we early-
// return: the search index has nothing for them.
func (s *stationSearch) QueryEvents(filter nostr.Filter, maxLimit int) iter.Seq[nostr.Event] {
	return func(yield func(nostr.Event) bool) {
		terms := strings.Fields(strings.ToLower(strings.TrimSpace(filter.Search)))
		if len(terms) == 0 {
			return
		}

		// the search index is station-only. if the caller restricted to kinds
		// that don't include 31237, there's nothing to return.
		if len(filter.Kinds) > 0 {
			wantsStations := false
			for _, k := range filter.Kinds {
				if k == indexedKind {
					wantsStations = true
					break
				}
			}
			if !wantsStations {
				return
			}
		}

		var conjuncts []bleveQuery.Query
		for _, term := range terms {
			matchQ := bleve.NewMatchQuery(term)
			matchQ.SetField("c")

			prefixQ := bleve.NewPrefixQuery(term)
			prefixQ.SetField("c")

			// term matches if either the word is present OR the term is a prefix of a word
			conjuncts = append(conjuncts, bleve.NewDisjunctionQuery(matchQ, prefixQ))
		}

		// Author filter → disjunction of term queries on "p"
		if len(filter.Authors) > 0 {
			authorDisjuncts := make([]bleveQuery.Query, 0, len(filter.Authors))
			for _, a := range filter.Authors {
				authorDisjuncts = append(authorDisjuncts, newKeywordTermQuery("p", a.Hex()))
			}
			if len(authorDisjuncts) == 1 {
				conjuncts = append(conjuncts, authorDisjuncts[0])
			} else {
				conjuncts = append(conjuncts, bleve.NewDisjunctionQuery(authorDisjuncts...))
			}
		}

		// Since/Until → numeric range on "t"
		if filter.Since != 0 || filter.Until != 0 {
			var min, max *float64
			inc := true
			if filter.Since != 0 {
				v := float64(filter.Since)
				min = &v
			}
			if filter.Until != 0 {
				v := float64(filter.Until)
				max = &v
			}
			rq := bleve.NewNumericRangeInclusiveQuery(min, max, &inc, &inc)
			rq.SetField("t")
			conjuncts = append(conjuncts, rq)
		}

		var q bleveQuery.Query
		if len(conjuncts) == 1 {
			q = conjuncts[0]
		} else {
			q = bleve.NewConjunctionQuery(conjuncts...)
		}

		req := bleve.NewSearchRequest(q)
		req.Size = maxLimit

		result, err := s.index.Search(req)
		if err != nil {
			log.Printf("❌ [SEARCH] bleve query error: %v", err)
			return
		}

		for _, hit := range result.Hits {
			id, err := nostr.IDFromHex(hit.ID)
			if err != nil {
				continue
			}
			// Just skip if LMDB doesn't have this ID. We must NOT delete the
			// bleve entry on the read path: a transient LMDB read miss (txn
			// snapshot, races, anything) would permanently corrupt the index
			// and the same query would return fewer results forever after.
			// Drift cleanup is the reindex's job, not the query path's.
			for evt := range s.rawStore.QueryEvents(nostr.Filter{IDs: []nostr.ID{id}}, 1) {
				if !yield(evt) {
					return
				}
			}
		}
	}
}

func main() {
	flag.Parse()

	if *resetAll {
		*resetDB = true
		*resetIndex = true
	}

	if *resetDB {
		log.Println("⚠️  Resetting LMDB database...")
		if err := os.RemoveAll(*dbPath); err != nil && !os.IsNotExist(err) {
			log.Fatalf("Failed to reset database: %v", err)
		}
		log.Println("✅ Database reset complete")
	}

	if *resetIndex {
		log.Println("⚠️  Resetting search index...")
		if err := os.RemoveAll(*searchPath); err != nil && !os.IsNotExist(err) {
			log.Fatalf("Failed to reset search index: %v", err)
		}
		log.Println("✅ Search index reset complete")
	}

	// Initialize LMDB backend
	if err := os.MkdirAll(*dbPath, 0755); err != nil {
		log.Fatalf("Failed to create data directory: %v", err)
	}
	db := &lmdb.LMDBBackend{Path: *dbPath}
	if err := db.Init(); err != nil {
		log.Fatalf("Failed to initialize LMDB: %v", err)
	}
	defer db.Close()

	// --reindex: clear bleve index so Init() starts fresh, then populate from LMDB
	if *reindex {
		log.Println("⚠️  Clearing search index for rebuild...")
		if err := os.RemoveAll(*searchPath); err != nil && !os.IsNotExist(err) {
			log.Fatalf("Failed to clear search index: %v", err)
		}
	}

	// Initialize custom station search index
	// Note: do NOT pre-create the search directory — bleve creates it on first run
	// and errors if it finds an existing empty directory without its metadata files.
	search := newStationSearch(*searchPath, db)
	if err := search.Init(); err != nil {
		log.Fatalf("Failed to initialize search index: %v", err)
	}

	if *reindex {
		log.Println("🔄 Reindexing all events from LMDB...")
		// 500-doc batches keep scorch segment writes under a megabyte-ish.
		// Larger batches have triggered internal "invalid address" errors
		// mid-scorch-flush on ~50k-event re-indexes; smaller + fall-back
		// keeps the reindex making progress even when one batch is bad.
		const batchSize = 500
		batch := search.index.NewBatch()
		batchIDs := make([]string, 0, batchSize)
		batchDocs := make([]map[string]any, 0, batchSize)
		count := 0
		failed := 0

		// commit the current batch. on scorch failure, fall back to per-doc
		// indexing so we only drop the specific document(s) that scorch choked on.
		commit := func() {
			if batch.Size() == 0 {
				return
			}
			if err := search.index.Batch(batch); err == nil {
				batch.Reset()
				batchIDs = batchIDs[:0]
				batchDocs = batchDocs[:0]
				return
			} else {
				log.Printf("⚠️  bleve batch flush failed at count=%d: %v — retrying per-doc", count, err)
			}
			// Per-doc retry so a single bad document doesn't stall the rebuild.
			for i := range batchIDs {
				if err := search.index.Index(batchIDs[i], batchDocs[i]); err != nil {
					failed++
					if failed < 10 {
						log.Printf("   ✗ skip %s: %v", batchIDs[i][:16], err)
					}
				}
			}
			batch = search.index.NewBatch()
			batchIDs = batchIDs[:0]
			batchDocs = batchDocs[:0]
		}

		// Track every LMDB station ID we tried to add, so we can audit after
		// the kind-index pass and catch anything the iterator silently dropped.
		seen := map[string]struct{}{}

		processEvent := func(evt nostr.Event) {
			id := evt.ID.Hex()
			doc := buildSearchDoc(evt)
			if err := batch.Index(id, doc); err != nil {
				log.Printf("⚠️  Failed to add %s to batch: %v", id[:8], err)
				failed++
				return
			}
			batchIDs = append(batchIDs, id)
			batchDocs = append(batchDocs, doc)
			count++
			seen[id] = struct{}{}
			if batch.Size() >= batchSize {
				commit()
				log.Printf("   Indexed %d stations (failed so far: %d)", count, failed)
			}
		}

		// Pass 1: kind-index walk. Fast path for the bulk of stations.
		for evt := range db.QueryEvents(nostr.Filter{Kinds: []nostr.Kind{indexedKind}}, 1000000) {
			processEvent(evt)
		}
		commit()

		// Pass 2: paginated until/since walk. Different access pattern catches
		// events the kind-index iterator missed when many stations share the
		// same created_at second (which happens after a bulk migration). Any
		// ID not seen in pass 1 gets indexed here.
		log.Println("🔎 Verification pass: paginated rescan for missed IDs...")
		recovered := 0
		until := uint32(4294967295)
		for {
			gotInWindow := 0
			oldestSeen := until
			for evt := range db.QueryEvents(nostr.Filter{
				Kinds: []nostr.Kind{indexedKind},
				Until: nostr.Timestamp(until),
				Limit: 5000,
			}, 5000) {
				gotInWindow++
				ts := uint32(evt.CreatedAt)
				if ts < oldestSeen {
					oldestSeen = ts
				}
				id := evt.ID.Hex()
				if _, ok := seen[id]; ok {
					continue
				}
				processEvent(evt)
				recovered++
			}
			if gotInWindow == 0 || oldestSeen == 0 || oldestSeen >= until {
				break
			}
			// step `until` to one second before the oldest seen so the next
			// page picks up older events
			until = oldestSeen - 1
		}
		commit()
		if recovered > 0 {
			log.Printf("🩹 Recovered %d stations the kind-index iterator missed", recovered)
		}

		log.Printf("✅ Reindex complete: %d stations indexed, %d skipped", count-failed, failed)
		// Close explicitly so scorch persists its last segments before we exit.
		if err := search.index.Close(); err != nil {
			log.Printf("⚠️  failed to close bleve index cleanly: %v", err)
		}
		return
	}
	defer search.Close()

	// Initialize relay
	relay := khatru.NewRelay()
	verboseTrafficLogging := envEnabled(os.Getenv("RELAY_VERBOSE_LOGGING"))
	strictPublicPolicy := strings.EqualFold(strings.TrimSpace(os.Getenv("RELAY_POLICY_MODE")), "wavefunc")
	relayPubKey := nostr.MustPubKeyFromHex("96c727f4d1ea18a80d03621520ebfe3c9be1387033009a4f5b65959d09222eec")
	relay.Info = &nip11.RelayInformationDocument{
		Name:          "WaveFunc Radio Relay",
		Description:   "A Nostr relay for internet radio stations with full-text search",
		PubKey:        &relayPubKey,
		Icon:          "https://wavefunc.live/icons/logo.png",
		Contact:       "https://github.com/schlaus/wavefunc-rewrite",
		SupportedNIPs: []any{1, 9, 11, 12, 15, 16, 20, 22, 33, 40, 45, 50},
	}

	if strictPublicPolicy {
		metadataPubKeyHex := strings.TrimSpace(os.Getenv("METADATA_SERVER_PUBKEY"))
		if metadataPubKeyHex == "" {
			metadataPubKeyHex = productionMetadataServerPubKey
		}
		metadataPubKey, err := nostr.PubKeyFromHex(metadataPubKeyHex)
		if err != nil {
			log.Fatalf("Invalid METADATA_SERVER_PUBKEY: %v", err)
		}

		// This relay is a WaveFunc application-data relay, not a public Nostr
		// firehose. Keep initial bursts usable for the app while bounding
		// reconnections, query churn, listener fan-out, and write amplification.
		relay.MaxMessageSize = 128 * 1024
		relay.RejectConnection = policies.ConnectionRateLimiter(5, time.Minute, 30)
		relay.OnRequest = policies.SeqRequest(
			externalPublicFilterPolicy,
			subscriptionLimitPolicy(relay, maxPublicSubscriptions),
			policies.FilterIPRateLimiter(5, time.Minute, 40),
		)
		relay.OnCount = policies.SeqRequest(
			rejectPublicCount,
			policies.FilterIPRateLimiter(5, time.Minute, 20),
		)
		relay.OnEvent = policies.SeqEvent(
			rejectPublicEvent(metadataPubKey),
			policies.RejectEventsWithBase64Media,
			policies.PreventLargeContent(64*1024),
			policies.PreventTooManyIndexableTags(128, nil, nil),
			policies.EventIPRateLimiter(10, time.Minute, 60),
		)
	}

	// Wire up LMDB as primary storage (also starts expiration manager)
	relay.UseEventstore(db, 1000)

	// Override StoreEvent to also index in bleve
	baseStore := relay.StoreEvent
	relay.StoreEvent = func(ctx context.Context, event nostr.Event) error {
		if verboseTrafficLogging {
			logIncomingEvent(event)
		}
		if err := baseStore(ctx, event); err != nil {
			return err
		}
		return search.SaveEvent(event)
	}

	// Override ReplaceEvent to also update bleve index. For station events we
	// capture the prior LMDB-resident event ID for this {pubkey, d} coordinate
	// *before* baseReplace runs (because baseReplace evicts the prior event
	// from LMDB), then hand it to search.ReplaceEvent so it can drop exactly
	// that one stale bleve doc. No broad sweep, no LMDB-miss-deletes.
	baseReplace := relay.ReplaceEvent
	relay.ReplaceEvent = func(ctx context.Context, event nostr.Event) error {
		var priorID nostr.ID
		if event.Kind == indexedKind {
			d := event.Tags.GetD()
			if d != "" {
				prevFilter := nostr.Filter{
					Kinds:   []nostr.Kind{indexedKind},
					Authors: []nostr.PubKey{event.PubKey},
					Tags:    nostr.TagMap{"d": []string{d}},
				}
				for prev := range db.QueryEvents(prevFilter, 1) {
					priorID = prev.ID
					break
				}
			}
		}
		if err := baseReplace(ctx, event); err != nil {
			return err
		}
		return search.ReplaceEvent(event, priorID)
	}

	// Override DeleteEvent to also remove from bleve.
	baseDelete := relay.DeleteEvent
	relay.DeleteEvent = func(ctx context.Context, id nostr.ID) error {
		if err := baseDelete(ctx, id); err != nil {
			return err
		}
		return search.DeleteEvent(id)
	}

	// Override QueryStored: use bleve for search queries, LMDB for regular queries.
	// The public endpoint gets shape-specific response caps; the local ContextVM
	// observer can perform its trusted catalog bootstrap without exposing that
	// large response window to the internet.
	relay.QueryStored = func(ctx context.Context, filter nostr.Filter) iter.Seq[nostr.Event] {
		isInternal := safeGetSubscriptionID(ctx) == "internal"
		if verboseTrafficLogging && !isInternal {
			logQuery(ctx, filter)
		}
		if len(filter.Search) > 0 {
			return search.QueryEvents(filter, 100)
		}
		if isInternal {
			return db.QueryEvents(filter, 1000)
		}
		if strictPublicPolicy {
			return db.QueryEvents(filter, publicQueryLimit(ctx, filter))
		}
		return db.QueryEvents(filter, 1000)
	}

	// NIP-45 COUNT support. The fast path is `{"kinds":[31237]}` with no
	// other constraints — that's the "how many stations are there?"
	// question the UI asks on every page load, and bleve's DocCount() is
	// O(1) since the index only ever holds station events.
	//
	// Other COUNT shapes are deliberately unsupported on this specialized
	// relay. This removes the previous 200k-event scan amplification path.
	relay.Count = func(_ context.Context, filter nostr.Filter) (uint32, error) {
		if isStationOnlyCountFilter(filter) {
			docCount, err := search.index.DocCount()
			if err == nil {
				return uint32(docCount), nil
			}
			// fall through to LMDB if bleve hiccups
		}
		return 0, fmt.Errorf("unsupported: only station COUNT is supported")
	}

	// Drift check: if LMDB has stations but the search index has essentially
	// none, log a loud warning. The deploy script will auto-reindex on a fresh
	// deploy, but operators need to see this immediately if something gets out
	// of sync at runtime.
	{
		lmdbCount := 0
		for range db.QueryEvents(nostr.Filter{Kinds: []nostr.Kind{indexedKind}}, 2) {
			lmdbCount++
		}
		if lmdbCount > 0 {
			if idxCount, err := search.index.DocCount(); err == nil && idxCount < 2 {
				log.Printf("⚠️  Search index is essentially empty (%d docs) but LMDB has stations.", idxCount)
				log.Printf("    NIP-50 search will return no results. Run `./relay/relay --reindex` to rebuild.")
			}
		}
	}

	address := net.JoinHostPort(*host, *port)
	log.Printf("🚀 WaveFunc Radio Relay starting on %s", address)
	log.Printf("📊 LMDB: %s", *dbPath)
	log.Printf("🔍 Search index: %s", *searchPath)
	if strictPublicPolicy {
		log.Printf("🛡️  Specialized WaveFunc relay policy enabled")
	} else {
		log.Printf("🧪 Permissive development relay policy enabled")
	}
	if verboseTrafficLogging {
		log.Printf("🧪 Verbose relay traffic logging enabled by RELAY_VERBOSE_LOGGING")
	}

	server := &http.Server{
		Addr:              address,
		Handler:           relay,
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       90 * time.Second,
	}
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Failed to start relay: %v", err)
	}
}

// logIncomingEvent logs events being stored
func logIncomingEvent(evt nostr.Event) {
	kindName := getKindName(evt.Kind)

	identifier := ""
	switch evt.Kind {
	case 31237:
		if tag := evt.Tags.Find("name"); tag != nil {
			identifier = fmt.Sprintf(" (%s)", tag[1])
		}
	case 31337:
		if tag := evt.Tags.Find("title"); tag != nil {
			identifier = fmt.Sprintf(" (%s)", tag[1])
		}
	case 30078, 31990, 31989:
		if tag := evt.Tags.Find("d"); tag != nil {
			identifier = fmt.Sprintf(" (d:%s)", tag[1])
		}
	}

	log.Printf("📝 [EVENT] Kind %d (%s)%s - ID: %.16s... (%.8s...)",
		evt.Kind, kindName, identifier, evt.ID.Hex(), evt.PubKey.Hex())
}

// safeGetSubscriptionID retrieves the subscription ID without panicking when
// the context doesn't carry one (e.g. internal queries triggered by delete requests).
func safeGetSubscriptionID(ctx context.Context) (subID string) {
	defer func() {
		if r := recover(); r != nil {
			subID = "internal"
		}
	}()
	subID = khatru.GetSubscriptionID(ctx)
	if subID == "" {
		subID = "internal"
	}
	return
}

// logQuery logs incoming subscription queries
func logQuery(ctx context.Context, filter nostr.Filter) {
	subID := safeGetSubscriptionID(ctx)

	var parts []string

	if len(filter.IDs) > 0 {
		parts = append(parts, fmt.Sprintf("IDs:%d", len(filter.IDs)))
	}
	if len(filter.Authors) > 0 {
		parts = append(parts, fmt.Sprintf("Authors:%d", len(filter.Authors)))
	}
	if len(filter.Kinds) > 0 {
		kinds := make([]string, len(filter.Kinds))
		for i, k := range filter.Kinds {
			kinds[i] = fmt.Sprintf("%d", k)
		}
		parts = append(parts, fmt.Sprintf("Kinds:[%s]", strings.Join(kinds, ",")))
	}
	if filter.Since != 0 {
		parts = append(parts, fmt.Sprintf("Since:%d", filter.Since))
	}
	if filter.Until != 0 {
		parts = append(parts, fmt.Sprintf("Until:%d", filter.Until))
	}
	if filter.Limit > 0 {
		parts = append(parts, fmt.Sprintf("Limit:%d", filter.Limit))
	}
	if filter.Search != "" {
		parts = append(parts, fmt.Sprintf("Search:'%s'", filter.Search))
	}
	for tagName, values := range filter.Tags {
		parts = append(parts, fmt.Sprintf("#%s:%d", tagName, len(values)))
	}

	filterDesc := strings.Join(parts, ", ")
	if filterDesc == "" {
		filterDesc = "empty filter"
	}

	log.Printf("🔍 [QUERY %s] %s", subID, filterDesc)
}

func getKindName(kind nostr.Kind) string {
	switch kind {
	case 0:
		return "Metadata"
	case 1:
		return "Note"
	case 3:
		return "Contacts"
	case 7:
		return "Reaction"
	case 1111:
		return "Comment"
	case 1311:
		return "Live Chat"
	case 9735:
		return "Zap"
	case 10002:
		return "Relay List"
	case 30078:
		return "App Data"
	case 31237:
		return "Radio Station"
	case 31337:
		return "Song"
	case 31989:
		return "Handler Recommendation"
	case 31990:
		return "Handler Info"
	default:
		if kind >= 30000 && kind < 40000 {
			return "Parameterized Replaceable"
		} else if kind >= 10000 && kind < 20000 {
			return "Replaceable"
		} else if kind >= 20000 && kind < 30000 {
			return "Ephemeral"
		}
		return "Unknown"
	}
}
