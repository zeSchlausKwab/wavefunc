package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"iter"
	"log"
	"os"
	"strconv"
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

func (s *stationSearch) SaveEvent(evt nostr.Event) error {
	content := evt.Content
	if evt.Kind == 31237 {
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
		// Index "name description" so both are searchable
		content = strings.TrimSpace(name + " " + description)
	}

	doc := map[string]any{
		"c": content,
		"k": strconv.Itoa(int(evt.Kind)),
	}
	return s.index.Index(evt.ID.Hex(), doc)
}

func (s *stationSearch) DeleteEvent(id nostr.ID) error {
	return s.index.Delete(id.Hex())
}

// QueryEvents searches the index. For each whitespace-separated term it builds
// a (MatchQuery OR PrefixQuery) so that partial words like "enall" match "enallax".
// All terms must match (AND between terms).
func (s *stationSearch) QueryEvents(filter nostr.Filter, maxLimit int) iter.Seq[nostr.Event] {
	return func(yield func(nostr.Event) bool) {
		terms := strings.Fields(strings.ToLower(strings.TrimSpace(filter.Search)))
		if len(terms) == 0 {
			return
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
	defer search.Close()

	if *reindex {
		log.Println("🔄 Reindexing all events from LMDB...")
		count := 0
		for evt := range db.QueryEvents(nostr.Filter{}, 1000000) {
			if err := search.SaveEvent(evt); err != nil {
				log.Printf("⚠️  Failed to index %s: %v", evt.ID.Hex()[:8], err)
			}
			count++
			if count%1000 == 0 {
				log.Printf("   Indexed %d events...", count)
			}
		}
		log.Printf("✅ Reindexed %d events", count)
		os.Exit(0)
	}

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

	// Override ReplaceEvent to also update bleve index
	baseReplace := relay.ReplaceEvent
	relay.ReplaceEvent = func(ctx context.Context, event nostr.Event) error {
		if err := baseReplace(ctx, event); err != nil {
			return err
		}
		return search.SaveEvent(event)
	}

	// Override DeleteEvent to also remove from bleve
	baseDelete := relay.DeleteEvent
	relay.DeleteEvent = func(ctx context.Context, id nostr.ID) error {
		if err := baseDelete(ctx, id); err != nil {
			return err
		}
		return search.DeleteEvent(id)
	}

	// Override QueryStored: use bleve for search queries, LMDB for regular queries
	relay.QueryStored = func(ctx context.Context, filter nostr.Filter) iter.Seq[nostr.Event] {
		logQuery(ctx, filter)
		if len(filter.Search) > 0 {
			return search.QueryEvents(filter, 100)
		}
		return db.QueryEvents(filter, 1000)
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
	case 30078, 31990, 31989:
		if tag := evt.Tags.Find("d"); tag != nil {
			identifier = fmt.Sprintf(" (d:%s)", tag[1])
		}
	}

	log.Printf("📝 [EVENT] Kind %d (%s)%s - ID: %.16s... (%.8s...)",
		evt.Kind, kindName, identifier, evt.ID.Hex(), evt.PubKey.Hex())
}

// logQuery logs incoming subscription queries
func logQuery(ctx context.Context, filter nostr.Filter) {
	subID := khatru.GetSubscriptionID(ctx)
	if subID == "" {
		subID = "internal"
	}

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
