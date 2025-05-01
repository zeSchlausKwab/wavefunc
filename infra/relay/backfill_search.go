//go:build ignore
// +build ignore

package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"flag"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/fiatjaf/eventstore/bluge"
	_ "github.com/lib/pq"
	"github.com/nbd-wtf/go-nostr"
)

// InMemoryStore is a simple implementation of RawEventStore
type InMemoryStore struct {
	events map[string]*nostr.Event
}

func NewInMemoryStore() *InMemoryStore {
	return &InMemoryStore{
		events: make(map[string]*nostr.Event),
	}
}

func (s *InMemoryStore) Init() error {
	return nil
}

func (s *InMemoryStore) SaveEvent(ctx context.Context, event *nostr.Event) error {
	s.events[event.ID] = event
	return nil
}

func (s *InMemoryStore) DeleteEvent(ctx context.Context, event *nostr.Event) error {
	delete(s.events, event.ID)
	return nil
}

func (s *InMemoryStore) ReplaceEvent(ctx context.Context, event *nostr.Event) error {
	s.events[event.ID] = event
	return nil
}

func (s *InMemoryStore) QueryEvents(ctx context.Context, filter nostr.Filter) (chan *nostr.Event, error) {
	ch := make(chan *nostr.Event)
	go func() {
		defer close(ch)
		for _, event := range s.events {
			if filter.Matches(event) {
				ch <- event
			}
		}
	}()
	return ch, nil
}

func (s *InMemoryStore) Close() {
	// Nothing to close in the in-memory store
}

// This script indexes all existing events from PostgreSQL into the Bluge search index
// Usage: go run backfill_search.go --dsn="postgres://user:password@localhost:5432/dbname" --dir="./data"
func main() {
	// Parse command line flags
	dsn := flag.String("dsn", "", "PostgreSQL connection string (required)")
	dataDir := flag.String("dir", "./data", "Data directory for the Bluge index")
	batchSize := flag.Int("batch", 1000, "Number of events to process per batch")
	flag.Parse()

	if *dsn == "" {
		log.Fatal("Error: --dsn flag is required")
	}

	// Connect to PostgreSQL
	db, err := sql.Open("postgres", *dsn)
	if err != nil {
		log.Fatalf("Error connecting to PostgreSQL: %v", err)
	}
	defer db.Close()

	// Check connection
	if err := db.Ping(); err != nil {
		log.Fatalf("Error pinging PostgreSQL: %v", err)
	}
	log.Println("Connected to PostgreSQL successfully")

	// Create Bluge search instance using the native implementation
	blugeDir := filepath.Join(*dataDir, "bluge_search")
	if err := os.MkdirAll(blugeDir, 0755); err != nil {
		log.Fatalf("Error creating Bluge directory: %v", err)
	}

	// Create in-memory store
	memStore := NewInMemoryStore()

	// Initialize Bluge
	blugeSearch := &bluge.BlugeBackend{
		Path:          blugeDir,
		RawEventStore: memStore,
	}

	if err := blugeSearch.Init(); err != nil {
		log.Fatalf("Error initializing Bluge: %v", err)
	}
	defer blugeSearch.Close()

	log.Printf("Bluge search initialized at: %s", blugeDir)

	// Get total number of events
	var totalEvents int
	err = db.QueryRow("SELECT COUNT(*) FROM event").Scan(&totalEvents)
	if err != nil {
		log.Fatalf("Error counting events: %v", err)
	}
	log.Printf("Found %d events to index", totalEvents)

	// Process events in batches
	offset := 0
	totalProcessed := 0
	startTime := time.Now()

	for {
		log.Printf("Processing batch at offset %d", offset)
		
		// Query events from PostgreSQL
		rows, err := db.Query(`
			SELECT id, pubkey, created_at, kind, tags, content, sig 
			FROM event 
			ORDER BY created_at 
			LIMIT $1 OFFSET $2
		`, *batchSize, offset)
		if err != nil {
			log.Fatalf("Error querying events: %v", err)
		}

		// Process this batch
		batchCount := 0
		for rows.Next() {
			var id, pubkey, content, sig string
			var createdAt int64
			var kind int
			var tagsJSON string

			if err := rows.Scan(&id, &pubkey, &createdAt, &kind, &tagsJSON, &content, &sig); err != nil {
				log.Printf("Error scanning row: %v", err)
				continue
			}

			// Parse tags JSON into nostr.Tags
			var tags nostr.Tags
			if err := json.Unmarshal([]byte(tagsJSON), &tags); err != nil {
				log.Printf("Error parsing tags for event %s: %v", id, err)
				// Continue with empty tags rather than skipping the event
				tags = nostr.Tags{}
			}

			// Check if this is a radio station by examining tags
			isRadioStation := false
			for _, tag := range tags {
				if len(tag) >= 2 && tag[0] == "name" {
					// Check if event has a 'name' tag, which is common for radio stations
					isRadioStation = true
					break
				}
			}

			// Additional check - if content looks like a radio station JSON
			if !isRadioStation && strings.Contains(content, "\"streams\"") && strings.Contains(content, "\"url\"") {
				isRadioStation = true
			}

			// If this is a radio station, ensure it has the correct kind
			if isRadioStation {
				// Force radio stations to use the standard kind
				kind = 31237
				log.Printf("Detected radio station event %s - using kind 31237", id)
			}

			// Create nostr event
			event := &nostr.Event{
				ID:        id,
				PubKey:    pubkey,
				CreatedAt: nostr.Timestamp(createdAt),
				Kind:      kind,
				Tags:      tags,
				Content:   content,
				Sig:       sig,
			}

			// First, save to memory store
			if err := memStore.SaveEvent(context.Background(), event); err != nil {
				log.Printf("Error saving event to memory: %v", err)
				continue
			}

			// Index event
			ctx := context.Background()
			if err := blugeSearch.SaveEvent(ctx, event); err != nil {
				log.Printf("Error indexing event %s: %v", id, err)
				continue
			}

			batchCount++
		}
		rows.Close()

		totalProcessed += batchCount
		log.Printf("Indexed %d events in this batch (%d/%d total, %.2f%%)", 
			batchCount, totalProcessed, totalEvents, float64(totalProcessed)/float64(totalEvents)*100)

		// If we got fewer results than batch size, we're done
		if batchCount < *batchSize {
			break
		}

		// Move to next batch
		offset += *batchSize

		// Small pause to allow system to breathe
		time.Sleep(100 * time.Millisecond)
	}

	duration := time.Since(startTime)
	log.Printf("Indexing complete! Processed %d events in %v (%.2f events/sec)", 
		totalProcessed, duration, float64(totalProcessed)/duration.Seconds())
} 