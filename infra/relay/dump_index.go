//go:build ignore
// +build ignore

package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/fiatjaf/eventstore/bluge"
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

// This script dumps all events in the Bluge index
// Usage: go run dump_index.go --dir="./data" --all
func main() {
	// Parse command line flags
	dataDir := flag.String("dir", "./data", "Data directory for the Bluge index")
	all := flag.Bool("all", false, "Show all events (not just kind 31237)")
	flag.Parse()

	// Set up paths
	blugeDir := filepath.Join(*dataDir, "bluge_search")
	if _, err := os.Stat(blugeDir); os.IsNotExist(err) {
		log.Fatalf("Error: Index directory doesn't exist: %s", blugeDir)
	}

	fmt.Printf("Opening Bluge index at: %s\n", blugeDir)

	// Create in-memory store
	memStore := NewInMemoryStore()

	// Initialize Bluge search
	blugeSearch := &bluge.BlugeBackend{
		Path:          blugeDir,
		RawEventStore: memStore,
	}

	if err := blugeSearch.Init(); err != nil {
		log.Fatalf("Error initializing Bluge: %v", err)
	}
	defer blugeSearch.Close()

	// Create a filter that matches all events or just radio stations
	var filter nostr.Filter
	if *all {
		filter = nostr.Filter{} // Empty filter matches all events
		fmt.Println("Dumping ALL events in the index...")
	} else {
		filter = nostr.Filter{
			Kinds: []int{31237}, // Only radio stations
		}
		fmt.Println("Dumping radio station events (kind 31237) in the index...")
	}

	fmt.Println("------------------------------------------------")

	// Execute the query
	ctx := context.Background()
	eventChan, err := blugeSearch.QueryEvents(ctx, filter)
	if err != nil {
		log.Fatalf("Error executing query: %v", err)
	}

	// Process results
	count := 0
	for event := range eventChan {
		count++
		printEvent(event, count)
	}

	if count == 0 {
		fmt.Println("No events found in the index.")
	} else {
		fmt.Printf("\nFound %d total events in the index\n", count)
	}
}

// printEvent formats and prints a nostr event
func printEvent(event *nostr.Event, num int) {
	// Format created_at timestamp
	createdTime := time.Unix(int64(event.CreatedAt), 0)

	fmt.Printf("Event #%d\n", num)
	fmt.Printf("ID: %s\n", event.ID)
	fmt.Printf("Kind: %d\n", event.Kind)
	fmt.Printf("Created At: %s (%d)\n", createdTime.Format(time.RFC3339), event.CreatedAt)
	fmt.Printf("Pubkey: %s\n", event.PubKey)

	// Print tags
	fmt.Println("Tags:")
	for _, tag := range event.Tags {
		if len(tag) > 0 {
			fmt.Printf("  - %s: %v\n", tag[0], tag[1:])
		}
	}

	// Print content (limit to 200 chars if long)
	content := event.Content
	if len(content) > 200 {
		content = content[:200] + "..."
	}
	fmt.Printf("Content: %s\n", content)
	fmt.Println("------------------------------------------------")
} 