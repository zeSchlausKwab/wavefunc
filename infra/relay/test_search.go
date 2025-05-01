//go:build ignore
// +build ignore

package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/blugelabs/bluge"
	"github.com/nbd-wtf/go-nostr"
)

// This is a test script that can be run with:
// go run test_search.go
func main() {
	fmt.Println("Testing Bluge Search directly (without PostgreSQL)")

	// Set up data directory for Bluge index
	dataDir := "direct_test"
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		log.Fatalf("error creating test data directory: %v", err)
	}
	defer os.RemoveAll(dataDir) // Clean up test data when done

	// Initialize Bluge writer
	indexPath := dataDir + "/bluge_index"
	config := bluge.DefaultConfig(indexPath)
	writer, err := bluge.OpenWriter(config)
	if err != nil {
		log.Fatalf("error opening writer: %v", err)
	}
	defer writer.Close()

	fmt.Printf("Created Bluge index at: %s\n", indexPath)

	// Create simple content strings that contain fixed search terms
	searchableContent := [...]string{
		"test event for search functionality",
		"another sample event with different words",
		"this event mentions wavefunc radio explicitly",
		"nostr is mentioned in this event along with wavefunc",
	}
	
	// Create test documents and index them directly
	ctx := context.Background()
	testEvents := []*nostr.Event{}
	
	for i, content := range searchableContent {
		// Create a test event
		event := createTestEvent(content, 1)
		testEvents = append(testEvents, event)
		fmt.Printf("Created event %d with content: %s\n", i+1, content)
		
		// Create Bluge document
		doc := bluge.NewDocument(event.ID)
		
		// Add event ID field
		doc.AddField(bluge.NewKeywordField("id", event.ID).StoreValue())
		
		// Add pubkey field
		doc.AddField(bluge.NewKeywordField("pubkey", event.PubKey).StoreValue())
		
		// Add content as text field
		doc.AddField(bluge.NewTextField("content", event.Content).StoreValue())
		fmt.Printf("Added content field: %s\n", event.Content)
		
		// Add created_at as numeric field
		doc.AddField(bluge.NewNumericField("created_at", float64(event.CreatedAt)).StoreValue())
		
		// Add kind as numeric field
		doc.AddField(bluge.NewNumericField("kind", float64(event.Kind)).StoreValue())
		
		// Index the document
		// if err := writer.Update(doc.ID(), doc); err != nil {
		// 	log.Printf("error indexing document: %v", err)
		// } else {
		// 	fmt.Printf("Successfully indexed event %d: %s\n", i+1, event.ID)
		// }
	}

	// Wait for indexing to complete
	fmt.Println("Waiting for indexing to complete...")
	time.Sleep(2 * time.Second)

	// Now test search directly without any PostgreSQL dependency
	reader, err := writer.Reader()
	if err != nil {
		log.Fatalf("error getting reader: %v", err)
	}
	defer reader.Close()

	// Test search for various terms
	searchTerms := []string{"bagel"}
	for _, term := range searchTerms {
		fmt.Printf("\n=== Searching for: '%s' ===\n", term)
		
		// Create query
		query := buildSearchQuery(term)
		
		// Create search request
		searchRequest := bluge.NewTopNSearch(10, query).
			SortBy([]string{"-created_at"}) // Sort by created_at descending (newest first)
		
		// Execute search
		fmt.Printf("Executing search query...\n")
		dmi, err := reader.Search(ctx, searchRequest)
		if err != nil {
			fmt.Printf("Search error: %v\n", err)
			continue
		}
		
		// Count results
		count := 0
		match, err := dmi.Next()
		for err == nil && match != nil {
			count++
			
			// Extract stored fields
			var eventID, content, pubkey string
			
			match.VisitStoredFields(func(field string, value []byte) bool {
				switch field {
				case "id":
					eventID = string(value)
				case "content":
					content = string(value)
				case "pubkey":
					pubkey = string(value)
				}
				return true
			})
			
			fmt.Printf("Found: %s (ID: %s, PubKey: %s)\n", content, eventID, pubkey)
			
			match, err = dmi.Next()
		}
		
		if count == 0 {
			fmt.Println("No results found")
		} else {
			fmt.Printf("Total results: %d\n", count)
		}
	}

	fmt.Println("\nSearch tests completed")
}

// Helper to create a test event with a random pubkey
func createTestEvent(content string, kind int) *nostr.Event {
	// Generate a random pubkey (32 bytes hex-encoded)
	pubkeyBytes := make([]byte, 32)
	rand.Read(pubkeyBytes)
	pubkey := hex.EncodeToString(pubkeyBytes)
	
	// Use regular Unix timestamp (seconds)
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

// Helper to build a search query
func buildSearchQuery(searchTerm string) bluge.Query {
	// Split into terms
	terms := strings.Fields(searchTerm)
	fmt.Printf("Search string '%s' parsed into terms: %v\n", searchTerm, terms)
	
	if len(terms) == 0 {
		// Return match all if no terms
		fmt.Println("No search terms, using MatchAllQuery")
		return bluge.NewMatchAllQuery()
	}
	
	// Try multiple query types for the term
	if len(terms) == 1 {
		term := terms[0]
		fmt.Printf("Using multiple query types for: '%s'\n", term)
		
		q := bluge.NewBooleanQuery()
		
		// Term query (exact match, not analyzed)
		q.AddShould(bluge.NewTermQuery(term).SetField("content"))
		
		// Match query (analyzed)
		q.AddShould(bluge.NewMatchQuery(term).SetField("content"))
		
		// Wildcard queries
		q.AddShould(bluge.NewWildcardQuery("*"+term+"*").SetField("content"))
		
		// Fuzzy query (allows typos)
		fuzzyQuery := bluge.NewFuzzyQuery(term)
		fuzzyQuery.SetField("content")
		fuzzyQuery.SetFuzziness(1)
		q.AddShould(fuzzyQuery)
		
		return q
	}
	
	// For multiple terms, OR them together
	q := bluge.NewBooleanQuery()
	for _, term := range terms {
		termQuery := bluge.NewMatchQuery(term).SetField("content")
		q.AddShould(termQuery)
	}
	
	return q
} 