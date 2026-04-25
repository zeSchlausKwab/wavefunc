package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"iter"
	"log"
	"os"
	"strings"

	bleve "github.com/blevesearch/bleve/v2"
	bleveMapping "github.com/blevesearch/bleve/v2/mapping"
	bleveQuery "github.com/blevesearch/bleve/v2/search/query"

	"fiatjaf.com/nostr"
	"fiatjaf.com/nostr/eventstore"
	"fiatjaf.com/nostr/eventstore/lmdb"
	"fiatjaf.com/nostr/khatru"
	"fiatjaf.com/nostr/nip11"
)

var (
	port       = flag.String("port", "3334", "Port to listen on")
	dbPath     = flag.String("db-path", "./data/events", "Path to LMDB database directory")
	searchPath = flag.String("search-path", "./data/search", "Path to bleve search index")
	resetDB    = flag.Bool("reset-db", false, "Reset the database")
	resetIndex = flag.Bool("reset-index", false, "Reset the search index")
	resetAll   = flag.Bool("reset-all", false, "Reset both database and index")
	reindex    = flag.Bool("reindex", false, "Rebuild search index from existing LMDB data then exit")
)

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

// ReplaceEvent updates the bleve index when a kind-31237 station is republished
// under the same {pubkey, d-tag} coordinate. It indexes the new event and
// sweeps stale bleve entries for the same coordinate so searches never return
// dead IDs that LMDB has already replaced. For non-station kinds it's a no-op
// (those kinds aren't indexed).
func (s *stationSearch) ReplaceEvent(evt nostr.Event) error {
	if evt.Kind != indexedKind {
		return nil
	}

	// Always (re-)index the new event first.
	if err := s.index.Index(evt.ID.Hex(), buildSearchDoc(evt)); err != nil {
		return err
	}

	// Find the current live event ID for this {pubkey, d} coordinate.
	liveFilter := nostr.Filter{
		Kinds:   []nostr.Kind{indexedKind},
		Authors: []nostr.PubKey{evt.PubKey},
		Tags:    nostr.TagMap{"d": []string{evt.Tags.GetD()}},
	}
	liveID := evt.ID
	for live := range s.rawStore.QueryEvents(liveFilter, 1) {
		liveID = live.ID
		break
	}

	// Sweep any bleve entries for this author whose ID no longer matches the
	// live one. Since only kind-31237 events are ever indexed, narrowing by
	// pubkey is sufficient to find the zombies for this author's stations.
	req := bleve.NewSearchRequest(newKeywordTermQuery("p", evt.PubKey.Hex()))
	req.Size = 1000
	res, err := s.index.Search(req)
	if err != nil {
		return nil // sweeping is best-effort
	}
	liveHex := liveID.Hex()
	for _, hit := range res.Hits {
		if hit.ID == liveHex {
			continue
		}
		// Re-fetch from LMDB; if it's not there the ID is a zombie. If it is
		// there it's a different station from the same author — leave it.
		found := false
		for prev := range s.rawStore.QueryEvents(nostr.Filter{IDs: []nostr.ID{mustID(hit.ID)}}, 1) {
			_ = prev
			found = true
			break
		}
		if found {
			continue
		}
		_ = s.index.Delete(hit.ID)
	}
	return nil
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
			emitted := false
			for evt := range s.rawStore.QueryEvents(nostr.Filter{IDs: []nostr.ID{id}}, 1) {
				emitted = true
				if !yield(evt) {
					return
				}
			}
			if !emitted {
				// bleve has a stale entry (event replaced/deleted in LMDB). Clean it up so
				// subsequent searches don't waste a slot on a dead ID.
				_ = s.index.Delete(hit.ID)
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
	relayPubKey := nostr.MustPubKeyFromHex("96c727f4d1ea18a80d03621520ebfe3c9be1387033009a4f5b65959d09222eec")
	relay.Info = &nip11.RelayInformationDocument{
		Name:          "WaveFunc Radio Relay",
		Description:   "A Nostr relay for internet radio stations with full-text search",
		PubKey:        &relayPubKey,
		Icon:          "https://wavefunc.live/icons/logo.png",
		Contact:       "https://github.com/schlaus/wavefunc-rewrite",
		SupportedNIPs: []any{1, 9, 11, 12, 15, 16, 20, 22, 33, 40, 50},
	}

	// Wire up LMDB as primary storage (also starts expiration manager)
	relay.UseEventstore(db, 1000)

	// Override StoreEvent to also index in bleve
	baseStore := relay.StoreEvent
	relay.StoreEvent = func(ctx context.Context, event nostr.Event) error {
		logIncomingEvent(event)
		if err := baseStore(ctx, event); err != nil {
			return err
		}
		return search.SaveEvent(event)
	}

	// Override ReplaceEvent to also update bleve index (and sweep stale IDs from
	// prior versions of the same {kind,pubkey,d} coordinate).
	baseReplace := relay.ReplaceEvent
	relay.ReplaceEvent = func(ctx context.Context, event nostr.Event) error {
		if err := baseReplace(ctx, event); err != nil {
			return err
		}
		return search.ReplaceEvent(event)
	}

	// Override DeleteEvent to also remove from bleve
	baseDelete := relay.DeleteEvent
	relay.DeleteEvent = func(ctx context.Context, id nostr.ID) error {
		if err := baseDelete(ctx, id); err != nil {
			return err
		}
		return search.DeleteEvent(id)
	}

	// Override QueryStored: use bleve for search queries, LMDB for regular queries.
	// Internal calls (e.g. from handleDeleteRequest) have no subscription ID in context
	// and are identified by safeGetSubscriptionID returning "internal". For those calls
	// we skip logging and apply phantom-event logic so that kind-5 deletion events are
	// always accepted even when the referenced event is not in this relay's database.
	relay.QueryStored = func(ctx context.Context, filter nostr.Filter) iter.Seq[nostr.Event] {
		isInternal := safeGetSubscriptionID(ctx) == "internal"
		if !isInternal {
			logQuery(ctx, filter)
		}
		if len(filter.Search) > 0 {
			return search.QueryEvents(filter, 100)
		}
		if !isInternal {
			return db.QueryEvents(filter, 1000)
		}
		// Internal delete-check query: run normally, but if nothing is found AND the
		// filter targets a specific author (from an "a"-tag coordinate), yield a phantom
		// event. The phantom passes the author-equality check in handleDeleteRequest so
		// haveDeletedSomething is set and the relay returns OK. DeleteEvent is then
		// called with the phantom's zero ID which is a no-op in LMDB.
		return func(yield func(nostr.Event) bool) {
			found := false
			for evt := range db.QueryEvents(filter, 1000) {
				found = true
				if !yield(evt) {
					return
				}
			}
			if !found && len(filter.Authors) == 1 {
				phantom := nostr.Event{PubKey: filter.Authors[0]}
				if len(filter.Kinds) > 0 {
					phantom.Kind = filter.Kinds[0]
				}
				yield(phantom)
			}
		}
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

	port := *port
	log.Printf("🚀 WaveFunc Radio Relay starting on port %s", port)
	log.Printf("📊 LMDB: %s", *dbPath)
	log.Printf("🔍 Search index: %s", *searchPath)

	portInt := 3334
	fmt.Sscanf(port, "%d", &portInt)

	if err := relay.Start("0.0.0.0", portInt); err != nil {
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
