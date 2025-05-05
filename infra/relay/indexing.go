package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/fiatjaf/eventstore/bluge"
	"github.com/fiatjaf/eventstore/postgresql"
	"github.com/nbd-wtf/go-nostr"
)

// HandleResetSearchIndex handles the reset search index admin endpoint
func HandleResetSearchIndex(w http.ResponseWriter, r *http.Request, connString, dataDir string, existingSearch *bluge.BlugeBackend) {
	// Check if already indexing
	indexingMutex.Lock()
	if isIndexing {
		indexingMutex.Unlock()
		http.Error(w, "Indexing already in progress", http.StatusConflict)
		return
	}
	isIndexing = true
	indexingStatus = "Starting..."
	indexingPercent = 0
	indexingMutex.Unlock()

	// Start reindexing in a separate goroutine
	go func() {
		defer func() {
			indexingMutex.Lock()
			isIndexing = false
			indexingStatus = "Completed"
			indexingPercent = 100
			indexingMutex.Unlock()
		}()

		// Set status to connecting
		indexingMutex.Lock()
		indexingStatus = "Connecting to database..."
		indexingMutex.Unlock()

		// Connect to PostgreSQL
		db, err := sql.Open("postgres", connString)
		if err != nil {
			log.Printf("Error connecting to PostgreSQL: %v", err)
			SetIndexingError(fmt.Sprintf("Database connection error: %v", err))
			return
		}
		defer db.Close()

		// Check connection
		if err := db.Ping(); err != nil {
			log.Printf("Error pinging PostgreSQL: %v", err)
			SetIndexingError(fmt.Sprintf("Database ping error: %v", err))
			return
		}
		log.Println("Connected to PostgreSQL successfully")

		// Set status to initializing
		indexingMutex.Lock()
		indexingStatus = "Initializing search index..."
		indexingMutex.Unlock()

		// Close the existing search to release locks on the files
		if existingSearch != nil {
			existingSearch.Close()
		}
		
		// Create Bluge search instance
		blugeDir := filepath.Join(dataDir, "bluge_search")
		
		// Remove existing index if it exists
		if err := os.RemoveAll(blugeDir); err != nil {
			log.Printf("Error removing existing index: %v", err)
			SetIndexingError(fmt.Sprintf("Failed to remove existing index: %v", err))
			return
		}
		
		// Create directory for new index
		if err := os.MkdirAll(blugeDir, 0755); err != nil {
			log.Printf("Error creating Bluge directory: %v", err)
			SetIndexingError(fmt.Sprintf("Failed to create index directory: %v", err))
			return
		}

		// Create a PostgreSQL backend for the new indexer
		// This matches how the main instance works - using PostgreSQL as the backing store
		pgBackend := postgresql.PostgresBackend{DatabaseURL: connString}
		if err := pgBackend.Init(); err != nil {
			log.Printf("Error initializing PostgreSQL backend: %v", err)
			SetIndexingError(fmt.Sprintf("Database initialization error: %v", err))
			return
		}

		// Initialize Bluge with PostgreSQL backend
		blugeSearch := &bluge.BlugeBackend{
			Path:          blugeDir,
			RawEventStore: &pgBackend,
		}

		if err := blugeSearch.Init(); err != nil {
			log.Printf("Error initializing Bluge: %v", err)
			SetIndexingError(fmt.Sprintf("Failed to initialize search index: %v", err))
			return
		}
		defer blugeSearch.Close()

		log.Printf("Bluge search initialized at: %s", blugeDir)

		// Set status to counting
		indexingMutex.Lock()
		indexingStatus = "Counting events..."
		indexingMutex.Unlock()

		// Get batch size (fixed at 500 for now)
		batchSize := 500

		// Get total number of radio station events (kind 31237)
		var totalEvents int
		err = db.QueryRow("SELECT COUNT(*) FROM event WHERE kind = 31237").Scan(&totalEvents)
		if err != nil {
			log.Printf("Error counting events: %v", err)
			SetIndexingError(fmt.Sprintf("Error counting events: %v", err))
			return
		}
		
		log.Printf("Found %d events to index", totalEvents)

		// Set status to indexing
		indexingMutex.Lock()
		indexingStatus = fmt.Sprintf("Indexing %d radio station events (kind 31237)...", totalEvents)
		indexingMutex.Unlock()

		// Process events in batches
		offset := 0
		totalProcessed := 0
		startTime := time.Now()

		for {
			indexingMutex.Lock()
			indexingStatus = fmt.Sprintf("Processing batch at offset %d (%d/%d)", offset, totalProcessed, totalEvents)
			indexingPercent = float64(totalProcessed) / float64(totalEvents) * 100
			indexingMutex.Unlock()
			
			log.Printf("Processing batch at offset %d", offset)
			
			// Query only radio station events (kind 31237) from PostgreSQL
			rows, err := db.Query(`
				SELECT id, pubkey, created_at, kind, tags, content, sig 
				FROM event 
				WHERE kind = 31237
				ORDER BY created_at 
				LIMIT $1 OFFSET $2
			`, batchSize, offset)
			if err != nil {
				log.Printf("Error querying events: %v", err)
				SetIndexingError(fmt.Sprintf("Error querying events: %v", err))
				return
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

				// Extract metadata to create searchable content
				name, description, genres, languages := extractEventMetadata(&nostr.Event{
					ID:        id,
					PubKey:    pubkey,
					CreatedAt: nostr.Timestamp(createdAt),
					Kind:      kind,
					Tags:      tags,
					Content:   content,
					Sig:       sig,
				})

				// Create a combined search text for better searching
				// This is similar to what our WavefuncBlugeWrapper does
				searchableContent := name + " " + name + " " + description
				
				// Add genres and languages to searchable content
				if len(genres) > 0 {
					searchableContent += " " + strings.Join(genres, " ")
				}
				if len(languages) > 0 {
					searchableContent += " " + strings.Join(languages, " ")
				}
				
				// Convert to lowercase for case-insensitive searching
				searchableContent = strings.ToLower(searchableContent)

				// Create nostr event
				event := &nostr.Event{
					ID:        id,
					PubKey:    pubkey,
					CreatedAt: nostr.Timestamp(createdAt),
					Kind:      kind,
					Tags:      tags,
					// Use the enhanced searchable content instead of the original content
					// This ensures the index has the same format as real-time events
					Content:   searchableContent,
					Sig:       sig,
				}

				// Log detailed info about important events for debugging
				if batchCount % 100 == 0 || totalProcessed < 10 {
					log.Printf("Indexing event: ID=%s, Kind=%d, Name=%s", id, kind, name)
					log.Printf("Enhanced content: %s", searchableContent)
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
			
			// If we got fewer results than batch size, we're done
			if batchCount < batchSize {
				break
			}

			// Move to next batch
			offset += batchSize

			// Small pause to allow system to breathe
			time.Sleep(100 * time.Millisecond)
		}

		duration := time.Since(startTime)
		completionMsg := fmt.Sprintf("Indexing complete! Processed %d radio station events in %v (%.2f events/sec)", 
			totalProcessed, duration, float64(totalProcessed)/duration.Seconds())
		
		log.Println(completionMsg)

		// Reinitialize the main bluge search (replacing the pointer target)
		*existingSearch = bluge.BlugeBackend{
			Path:          blugeDir,
			RawEventStore: existingSearch.RawEventStore,
		}
		
		if err := existingSearch.Init(); err != nil {
			log.Printf("Error reinitializing main search: %v", err)
			SetIndexingError(fmt.Sprintf("Failed to update main search: %v", err))
			return
		}
		
		// Test search functionality with a simple query to verify indexing worked
		log.Println("Testing search functionality...")
		testSearchFilter := nostr.Filter{
			Kinds: []int{31237},
			Search: "test",
		}
		testResults, err := existingSearch.QueryEvents(context.Background(), testSearchFilter)
		if err != nil {
			log.Printf("Warning: Search test failed: %v", err)
		} else {
			resultCount := 0
			for range testResults {
				resultCount++
				if resultCount >= 5 {
					break
				}
			}
			log.Printf("Search test found %d results for query 'test'", resultCount)
		}
		
		// Set the final status
		indexingMutex.Lock()
		indexingStatus = completionMsg
		indexingPercent = 100
		indexingMutex.Unlock()
	}()

	// Immediately return success response, since processing continues in the background
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "started",
		"message": "Reindexing started in the background",
	})
}

// HandleIndexingStatus handles retrieving indexing status
func HandleIndexingStatus(w http.ResponseWriter, r *http.Request) {
	// Get current status
	indexingMutex.Lock()
	status := map[string]interface{}{
		"isIndexing": isIndexing,
		"status":     indexingStatus,
		"percent":    indexingPercent,
	}
	indexingMutex.Unlock()

	// Return JSON response
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}

// SetIndexingError sets error status for indexing
func SetIndexingError(errMsg string) {
	indexingMutex.Lock()
	indexingStatus = "Error: " + errMsg
	isIndexing = false
	indexingMutex.Unlock()
	log.Printf("Indexing error: %s", errMsg)
} 