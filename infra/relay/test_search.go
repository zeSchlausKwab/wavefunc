//go:build ignore
// +build ignore

package main

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"

	"relay/search"

	"github.com/fiatjaf/eventstore/postgresql"
	_ "github.com/lib/pq"
	"github.com/nbd-wtf/go-nostr"
)

// This is a test script that can be run with:
// go run test_search.go
func main() {
	fmt.Println("Testing Bluge Search for Nostr events")

	// Set up PostgreSQL (use same logic as in main.go)
	connString := os.Getenv("POSTGRES_CONNECTION_STRING")
	if connString == "" {
		connString = os.Getenv("DATABASE_URL")
	}
	if connString == "" {
		connString = "postgres://postgres:postgres@localhost:5432/nostr?sslmode=disable"
	}

	fmt.Printf("Using connection string: %s\n", connString)

	// Initialize PostgreSQL backend
	db := postgresql.PostgresBackend{DatabaseURL: connString}
	if err := db.Init(); err != nil {
		log.Fatalf("error initializing PostgreSQL: %v", err)
	}

	// Set up data directory for Bluge search index
	dataDir := "data_test"
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		log.Fatalf("error creating test data directory: %v", err)
	}
	defer os.RemoveAll(dataDir) // Clean up test data when done

	// Initialize Bluge search backend
	blugeSearchPath := search.GetPath(dataDir)
	fmt.Printf("Using Bluge test index at: %s\n", blugeSearchPath)

	blugeSearch := &search.BlugeSearch{
		Path:          blugeSearchPath,
		RawEventStore: &db,
	}

	if err := blugeSearch.Init(); err != nil {
		log.Fatalf("error initializing Bluge search: %v", err)
	}
	defer blugeSearch.Close()

	// Create timestamp for unique content
	timestamp := time.Now().Format(time.RFC3339)
	
	// Create test events with content to search - use timestamp to make each unique
	testEvents := []*nostr.Event{
		createTestEvent(fmt.Sprintf("This is a test event for Bluge search functionality. Timestamp: %s", timestamp), 1),
		createTestEvent(fmt.Sprintf("Another test event with different content. Timestamp: %s", timestamp), 1),
		createTestEvent(fmt.Sprintf("A third event mentioning wavefunc radio. Timestamp: %s", timestamp), 1),
		createTestEvent(fmt.Sprintf("Fourth event with content about nostr and wavefunc. Timestamp: %s", timestamp), 1),
	}

	// Save each test event to both PostgreSQL and Bluge
	ctx := context.Background()
	for i, evt := range testEvents {
		fmt.Printf("Saving event %d: ID=%s, PubKey=%s\n", i+1, evt.ID, evt.PubKey)
		
		// Add direct to PostgreSQL - avoid verification issues
		if err := insertEventDirectly(connString, evt); err != nil {
			log.Printf("error saving to PostgreSQL: %v", err)
		} else {
			fmt.Printf("  ✓ Saved to PostgreSQL\n")
		}
		
		// Save to Bluge
		if err := blugeSearch.SaveEvent(ctx, evt); err != nil {
			log.Printf("error saving to Bluge: %v", err)
		} else {
			fmt.Printf("  ✓ Saved to Bluge\n")
		}
	}

	// Wait for indexing to complete
	fmt.Println("Waiting for indexing to complete...")
	time.Sleep(2 * time.Second)

	// Test search for "test"
	testSearch(ctx, blugeSearch, "test")
	
	// Test search for "wavefunc"
	testSearch(ctx, blugeSearch, "wavefunc")
	
	// Test search for "nostr"
	testSearch(ctx, blugeSearch, "nostr")
	
	// Test search for something that doesn't exist
	testSearch(ctx, blugeSearch, "nonexistent")

	fmt.Println("Search tests completed")
}

// Helper function to directly insert event into PostgreSQL
func insertEventDirectly(connString string, evt *nostr.Event) error {
	// Open a connection to PostgreSQL
	sqlDB, err := sql.Open("postgres", connString)
	if err != nil {
		return fmt.Errorf("error connecting to database: %w", err)
	}
	defer sqlDB.Close()

	// Convert tags to JSON
	tagsJSON, err := json.Marshal(evt.Tags)
	if err != nil {
		return fmt.Errorf("error marshaling tags to JSON: %w", err)
	}

	// Insert the event directly into the event table (singular, not plural)
	query := `
	INSERT INTO event (id, pubkey, created_at, kind, tags, content, sig)
	VALUES ($1, $2, $3, $4, $5, $6, $7)
	ON CONFLICT (id) DO NOTHING
	`

	_, err = sqlDB.Exec(
		query,
		evt.ID,
		evt.PubKey,
		evt.CreatedAt,
		evt.Kind,
		tagsJSON,
		evt.Content,
		evt.Sig,
	)

	if err != nil {
		return fmt.Errorf("error inserting event into database: %w", err)
	}

	return nil
}

// Helper to create a test event with a random pubkey
func createTestEvent(content string, kind int) *nostr.Event {
	// Generate a random pubkey (32 bytes hex-encoded)
	pubkeyBytes := make([]byte, 32)
	rand.Read(pubkeyBytes)
	pubkey := hex.EncodeToString(pubkeyBytes)
	
	// Use regular Unix timestamp (seconds) to avoid integer overflow in PostgreSQL
	createdAt := nostr.Timestamp(time.Now().Unix())
	
	// Create a unique event ID
	idBytes := make([]byte, 32)
	rand.Read(idBytes)
	id := hex.EncodeToString(idBytes)
	
	// Create event with the given content, kind, and random pubkey
	evt := &nostr.Event{
		ID:        id,
		PubKey:    pubkey,
		CreatedAt: createdAt,
		Kind:      kind,
		Tags:      []nostr.Tag{{"t", "test"}},
		Content:   content,
		Sig:       "fakesignaturefortesting", // Fake signature for testing
	}
	
	return evt
}

// Helper to test search and print results
func testSearch(ctx context.Context, searcher *search.BlugeSearch, searchTerm string) {
	fmt.Printf("\n=== Searching for: %s ===\n", searchTerm)
	
	// Create a filter with the search term
	filter := nostr.Filter{
		Kinds:  []int{1},
		Search: searchTerm,
		Limit:  10,
	}
	
	// Execute search
	fmt.Printf("Executing search query...\n")
	results, err := searcher.QueryEvents(ctx, filter)
	if err != nil {
		fmt.Printf("Search error: %v\n", err)
		return
	}
	
	// Count results
	count := 0
	for evt := range results {
		count++
		fmt.Printf("Found: %s (ID: %s, PubKey: %s)\n", evt.Content, evt.ID, evt.PubKey)
	}
	
	if count == 0 {
		fmt.Println("No results found")
	} else {
		fmt.Printf("Total results: %d\n", count)
	}
} 