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
	"sync"
	"time"

	"github.com/fiatjaf/eventstore/bluge"
	"github.com/fiatjaf/eventstore/postgresql"
	"github.com/fiatjaf/khatru"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"github.com/nbd-wtf/go-nostr"
)

// InMemoryStore is a simple implementation of RawEventStore for reindexing
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

// Global variables for indexing status
var (
	isIndexing      bool
	indexingMutex   sync.Mutex
	indexingStatus  string
	indexingPercent float64
)

func main() {
	// Enable verbose logging
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.Println("Starting relay with verbose logging")

	// Load .env only in local development
	if _, err := os.Stat(".env"); err == nil {
		if err := godotenv.Load(filepath.Join("..", "..", ".env")); err != nil {
			fmt.Printf("Warning: Error loading .env file: %v\n", err)
		}
	}

	relay := khatru.NewRelay()

	relay.Info.Name = "Wavefunc Relay"
	relay.Info.PubKey = os.Getenv("RELAY_PUBKEY")
	relay.Info.Description = "Wavefuncs indexed relay for things related to Internet Radio"
	relay.Info.Icon = "https://wavefunc.live/images/logo.png"
	
	// Get PostgreSQL connection string from env
	connString := os.Getenv("POSTGRES_CONNECTION_STRING")
	if connString == "" {
		// If DATABASE_URL is set (Railway standard), use that instead
		connString = os.Getenv("DATABASE_URL")
	}
	
	if connString == "" {
		// Default connection string if env var not set
		connString = "postgres://postgres:postgres@localhost:5432/nostr?sslmode=disable"
		fmt.Println("Warning: Using default PostgreSQL connection string")
	} else {
		// When running locally, replace 'postgres' hostname with 'localhost'
		// This allows connecting to the dockerized postgres from the local machine
		// Only do this if not in a Railway environment
		if os.Getenv("RAILWAY_ENVIRONMENT") == "" {
			connString = strings.Replace(connString, "@postgres:", "@localhost:", 1)
		}
		
		// Add sslmode=disable if not already present
		if !strings.Contains(connString, "sslmode=") {
			if strings.Contains(connString, "?") {
				connString += "&sslmode=disable"
			} else {
				connString += "?sslmode=disable"
			}
		}
		
		fmt.Printf("Using connection string: %s\n", connString)
	}

	// Initialize PostgreSQL backend
	db := postgresql.PostgresBackend{DatabaseURL: connString}
	if err := db.Init(); err != nil {
		panic(err)
	}

	// Set up data directory for Bluge search index
	dataDir := os.Getenv("DATA_DIR")
	if dataDir == "" {
		dataDir = "data"
	}
	
	// Create data directory if it doesn't exist
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		fmt.Printf("Warning: Error creating data directory: %v\n", err)
	}
	
	// Initialize Bluge search backend using the native implementation
	blugeSearchPath := filepath.Join(dataDir, "bluge_search")
	fmt.Printf("Using Bluge search index at: %s\n", blugeSearchPath)
	
	blugeSearch := bluge.BlugeBackend{
		Path:          blugeSearchPath,
		RawEventStore: &db,
	}
	
	if err := blugeSearch.Init(); err != nil {
		fmt.Printf("Error initializing Bluge search: %v\n", err)
		// Continue without search functionality
	} else {
		defer blugeSearch.Close()
		
		// Register handlers for events
		relay.StoreEvent = append(relay.StoreEvent, db.SaveEvent, func(ctx context.Context, event *nostr.Event) error {
			log.Printf("Indexing event: ID=%s, Kind=%d, PubKey=%s", event.ID, event.Kind, event.PubKey)
			return blugeSearch.SaveEvent(ctx, event)
		})
		relay.DeleteEvent = append(relay.DeleteEvent, db.DeleteEvent, blugeSearch.DeleteEvent)
		
		// Set up QueryEvents to route search queries to Bluge and regular queries to PostgreSQL
		relay.QueryEvents = append(relay.QueryEvents, func(ctx context.Context, filter nostr.Filter) (chan *nostr.Event, error) {
			if filter.Search != "" {
				// Use Bluge for search queries
				log.Printf("Handling search query: %s (kinds: %v)", filter.Search, filter.Kinds)
				events, err := blugeSearch.QueryEvents(ctx, filter)
				if err != nil {
					log.Printf("Error in Bluge search: %v", err)
					return nil, err
				}
				
				// Create a buffered channel to collect and log the results
				resultChan := make(chan *nostr.Event)
				go func() {
					defer close(resultChan)
					count := 0
					for event := range events {
						count++
						log.Printf("Search result #%d: ID=%s, Kind=%d", count, event.ID, event.Kind)
						resultChan <- event
					}
					log.Printf("Search query completed, returned %d results", count)
				}()
				
				return resultChan, nil
			} else {
				// Use PostgreSQL for regular queries
				return db.QueryEvents(ctx, filter)
			}
		})
	}

	// Add connection handler
	relay.OnConnect = []func(ctx context.Context){
		func(ctx context.Context) {
			fmt.Println("New connection established")
		},
	}

	// Create a custom handler for the admin endpoint
	adminHandler := http.NewServeMux()
	
	// Add admin reindex endpoint
	adminHandler.HandleFunc("/admin/reset-search-index", func(w http.ResponseWriter, r *http.Request) {
		handleResetSearchIndex(w, r, connString, dataDir, &blugeSearch)
	})
	
	// Add admin status endpoint
	adminHandler.HandleFunc("/admin/indexing-status", func(w http.ResponseWriter, r *http.Request) {
		handleIndexingStatus(w, r)
	})
	
	// Add health check endpoint
	adminHandler.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "OK")
	})

	// Get PORT from environment (Railway sets this automatically)
	port := os.Getenv("PORT")
	if port == "" {
		// Fallback to RELAY_PORT if PORT is not set
		port = os.Getenv("VITE_PUBLIC_RELAY_PORT")
		if port == "" {
			port = "3002"
		}
	}

	// Create a combined handler
	combinedHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if strings.HasPrefix(path, "/admin") || path == "/health" {
			// Admin or health endpoints
			adminHandler.ServeHTTP(w, r)
		} else {
			// Nostr relay websocket handler
			relay.ServeHTTP(w, r)
		}
	})

	fmt.Printf("Running on :%s with admin endpoints\n", port)
	err := http.ListenAndServe("0.0.0.0:"+port, combinedHandler)
	if err != nil {
		panic(err)
	}
}

// Handler for the reset search index admin endpoint
func handleResetSearchIndex(w http.ResponseWriter, r *http.Request, connString, dataDir string, existingSearch *bluge.BlugeBackend) {
	// Only allow POST requests
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Verify authorization token if provided
	authToken := os.Getenv("ADMIN_AUTH_TOKEN")
	if authToken != "" {
		providedToken := r.Header.Get("Authorization")
		// Simple token-based auth
		if providedToken != fmt.Sprintf("Bearer %s", authToken) {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
	}

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
			setIndexingError(fmt.Sprintf("Database connection error: %v", err))
			return
		}
		defer db.Close()

		// Check connection
		if err := db.Ping(); err != nil {
			log.Printf("Error pinging PostgreSQL: %v", err)
			setIndexingError(fmt.Sprintf("Database ping error: %v", err))
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
			setIndexingError(fmt.Sprintf("Failed to remove existing index: %v", err))
			return
		}
		
		// Create directory for new index
		if err := os.MkdirAll(blugeDir, 0755); err != nil {
			log.Printf("Error creating Bluge directory: %v", err)
			setIndexingError(fmt.Sprintf("Failed to create index directory: %v", err))
			return
		}

		// Create in-memory store
		memStore := NewInMemoryStore()

		// Initialize Bluge
		blugeSearch := &bluge.BlugeBackend{
			Path:          blugeDir,
			RawEventStore: memStore,
		}

		if err := blugeSearch.Init(); err != nil {
			log.Printf("Error initializing Bluge: %v", err)
			setIndexingError(fmt.Sprintf("Failed to initialize search index: %v", err))
			return
		}
		defer blugeSearch.Close()

		log.Printf("Bluge search initialized at: %s", blugeDir)

		// Set status to counting
		indexingMutex.Lock()
		indexingStatus = "Counting events..."
		indexingMutex.Unlock()

		// Get batch size (fixed at 1000 for now)
		batchSize := 1000

		// Get total number of events
		var totalEvents int
		err = db.QueryRow("SELECT COUNT(*) FROM event").Scan(&totalEvents)
		if err != nil {
			log.Printf("Error counting events: %v", err)
			setIndexingError(fmt.Sprintf("Error counting events: %v", err))
			return
		}
		
		log.Printf("Found %d events to index", totalEvents)

		// Set status to indexing
		indexingMutex.Lock()
		indexingStatus = fmt.Sprintf("Indexing %d events...", totalEvents)
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
			
			// Query events from PostgreSQL
			rows, err := db.Query(`
				SELECT id, pubkey, created_at, kind, tags, content, sig 
				FROM event 
				ORDER BY created_at 
				LIMIT $1 OFFSET $2
			`, batchSize, offset)
			if err != nil {
				log.Printf("Error querying events: %v", err)
				setIndexingError(fmt.Sprintf("Error querying events: %v", err))
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
		completionMsg := fmt.Sprintf("Indexing complete! Processed %d events in %v (%.2f events/sec)", 
			totalProcessed, duration, float64(totalProcessed)/duration.Seconds())
		
		log.Println(completionMsg)

		// Reinitialize the main bluge search (replacing the pointer target)
		*existingSearch = bluge.BlugeBackend{
			Path:          blugeDir,
			RawEventStore: existingSearch.RawEventStore,
		}
		
		if err := existingSearch.Init(); err != nil {
			log.Printf("Error reinitializing main search: %v", err)
			setIndexingError(fmt.Sprintf("Failed to update main search: %v", err))
			return
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

// Handler for retrieving indexing status
func handleIndexingStatus(w http.ResponseWriter, r *http.Request) {
	// Only allow GET requests
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

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

// Helper function to set error status
func setIndexingError(errMsg string) {
	indexingMutex.Lock()
	indexingStatus = "Error: " + errMsg
	isIndexing = false
	indexingMutex.Unlock()
	log.Printf("Indexing error: %s", errMsg)
}
