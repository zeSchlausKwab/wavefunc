package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"strconv"

	"github.com/fiatjaf/eventstore/bluge"
	"github.com/fiatjaf/eventstore/sqlite3"
	"github.com/fiatjaf/khatru"
	"github.com/nbd-wtf/go-nostr"
)

var (
	port       = flag.String("port", "3334", "Port to listen on")
	dbPath     = flag.String("db-path", "./data/events.db", "Path to SQLite database file")
	searchPath = flag.String("search-path", "./data/search", "Path to bluge search index")
	resetDB    = flag.Bool("reset-db", false, "Reset the SQLite database")
	resetIndex = flag.Bool("reset-index", false, "Reset the search index")
	resetAll   = flag.Bool("reset-all", false, "Reset both database and index")
)

func main() {
	flag.Parse()

	if *resetAll {
		*resetDB = true
		*resetIndex = true
	}

	if *resetDB {
		log.Println("⚠️  Resetting SQLite database...")
		if err := resetDatabase(); err != nil {
			log.Fatalf("Failed to reset database: %v", err)
		}
		log.Println("✅ Database reset complete")
	}

	if *resetIndex {
		log.Println("⚠️  Resetting search index...")
		if err := resetSearchIndex(); err != nil {
			log.Fatalf("Failed to reset search index: %v", err)
		}
		log.Println("✅ Search index reset complete")
	}

	// Initialize relay
	relay := khatru.NewRelay()
	relay.Info.Name = "WaveFunc Radio Relay"
	relay.Info.Description = "A Nostr relay for internet radio stations with full-text search"
	relay.Info.PubKey = "96c727f4d1ea18a80d03621520ebfe3c9be1387033009a4f5b65959d09222eec"
	relay.Info.Icon = "https://wavefunc.live/icons/logo.png"
	relay.Info.Contact = "https://github.com/schlaus/wavefunc-rewrite"
	relay.Info.SupportedNIPs = []any{1, 9, 11, 12, 15, 16, 20, 22, 33, 40, 50}

	// Initialize SQLite backend
	os.MkdirAll("./data", 0755)
	db := &sqlite3.SQLite3Backend{DatabaseURL: *dbPath}
	if err := db.Init(); err != nil {
		log.Fatalf("Failed to initialize SQLite: %v", err)
	}
	defer db.Close()

	// Initialize Bluge search backend
	os.MkdirAll(*searchPath, 0755)
	search := &bluge.BlugeBackend{
		Path:          *searchPath,
		RawEventStore: db,
	}
	if err := search.Init(); err != nil {
		log.Fatalf("Failed to initialize Bluge: %v", err)
	}
	defer search.Close()

	// Set up event storage with enrichment for search indexing
	relay.StoreEvent = append(relay.StoreEvent,
		db.SaveEvent,
		enrichAndIndexEvent(search),
	)

	// Set up event querying with search support
	relay.QueryEvents = append(relay.QueryEvents, func(ctx context.Context, filter nostr.Filter) (chan *nostr.Event, error) {
		// If the filter has a search term, use Bluge
		if len(filter.Search) > 0 {
			return search.QueryEvents(ctx, filter)
		}
		// Otherwise use SQLite
		return db.QueryEvents(ctx, filter)
	})

	// Set up event deletion
	relay.DeleteEvent = append(relay.DeleteEvent,
		db.DeleteEvent,
		search.DeleteEvent,
	)

	// Set up event replacement (for replaceable events)
	relay.RejectEvent = append(relay.RejectEvent, func(ctx context.Context, event *nostr.Event) (bool, string) {
		// Accept all events by default
		return false, ""
	})

	// Log startup
	log.Printf("🚀 WaveFunc Radio Relay starting on port %s", *port)
	log.Printf("📊 SQLite: %s", *dbPath)
	log.Printf("🔍 Search index: %s", *searchPath)

	// Convert port string to int
	portInt, err := strconv.Atoi(*port)
	if err != nil {
		log.Fatalf("Invalid port number: %v", err)
	}

	// Start the relay
	if err := relay.Start("0.0.0.0", portInt); err != nil {
		log.Fatalf("Failed to start relay: %v", err)
	}
}

func resetDatabase() error {
	// Remove the database file
	if err := os.Remove(*dbPath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to remove database: %w", err)
	}

	log.Println("Database removed. It will be recreated on next start.")
	return nil
}

func resetSearchIndex() error {
	// Remove the search index directory
	if err := os.RemoveAll(*searchPath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to remove search index: %w", err)
	}

	// Recreate the directory
	if err := os.MkdirAll(*searchPath, 0755); err != nil {
		return fmt.Errorf("failed to create search index directory: %w", err)
	}

	return nil
}

// StationContent represents the JSON structure in station event content
type StationContent struct {
	Description string `json:"description"`
}

// enrichAndIndexEvent adds description from content JSON as a tag so Bluge can index it
// Bluge automatically indexes all tag values, so we just need to make description a tag
func enrichAndIndexEvent(search *bluge.BlugeBackend) func(context.Context, *nostr.Event) error {
	return func(ctx context.Context, evt *nostr.Event) error {
		// Only enrich station events (kind 31237)
		if evt.Kind == 31237 {
			// Parse the content JSON to extract description
			var content StationContent
			if err := json.Unmarshal([]byte(evt.Content), &content); err == nil {
				// Add description as a searchable tag if it exists
				if content.Description != "" {
					// Check if description tag already exists
					hasDescTag := false
					for _, tag := range evt.Tags {
						if len(tag) >= 2 && tag[0] == "description" {
							hasDescTag = true
							break
						}
					}

					// Add description tag - Bluge will index all tag values including name and description
					if !hasDescTag {
						evt.Tags = append(evt.Tags, nostr.Tag{"description", content.Description})
					}
				}
			}
		}

		// Save to Bluge - it will index all tag values: name, description, genre, location, etc.
		return search.SaveEvent(ctx, evt)
	}
}
