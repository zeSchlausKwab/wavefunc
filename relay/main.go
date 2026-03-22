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

	"fiatjaf.com/nostr"
	nostrbleve "fiatjaf.com/nostr/eventstore/bleve"
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
)

// stationSearchIndex wraps BleveBackend to index station name alongside content
type stationSearchIndex struct {
	*nostrbleve.BleveBackend
}

func (s *stationSearchIndex) SaveEvent(evt nostr.Event) error {
	if evt.Kind == 31237 {
		name := ""
		if tag := evt.Tags.Find("name"); tag != nil {
			name = tag[1]
		}

		var content struct {
			Description string `json:"description"`
		}
		description := ""
		if err := json.Unmarshal([]byte(evt.Content), &content); err == nil {
			description = content.Description
		}

		// Synthetic event: content = "name description" so bleve indexes both
		searchEvt := evt
		searchEvt.Content = strings.TrimSpace(name + " " + description)
		return s.BleveBackend.SaveEvent(searchEvt)
	}
	return s.BleveBackend.SaveEvent(evt)
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

	// Initialize bleve search backend (wraps LMDB for raw event lookup)
	// Note: do NOT pre-create the search directory — bleve creates it on first run
	// and errors if it finds an empty directory without its metadata files.
	search := &stationSearchIndex{
		BleveBackend: &nostrbleve.BleveBackend{
			Path:          *searchPath,
			RawEventStore: db,
		},
	}
	if err := search.Init(); err != nil {
		log.Fatalf("Failed to initialize bleve: %v", err)
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
