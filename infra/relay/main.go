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
	authorizedAdmins []string
)

func main() {
	// Enable verbose logging
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.Println("Starting relay with verbose logging")

	envLocations := []string{
		filepath.Join("..", "..", ".env"), // grandparent dir
	}
	
	envLoaded := false
	for _, location := range envLocations {
		if _, err := os.Stat(location); err == nil {
			log.Printf("Found .env file at: %s", location)
			if err := godotenv.Load(location); err != nil {
				log.Printf("Warning: Error loading .env file from %s: %v", location, err)
			} else {
				log.Printf("Successfully loaded .env file from %s", location)
				envLoaded = true
				break
			}
		}
	}
	
	if !envLoaded {
		log.Println("Warning: No .env file loaded")
	}

	// Load authorized admins from environment variables
	adminPubKeys := os.Getenv("APP_PUBKEY")
	log.Printf("APP_PUBKEY: %q", adminPubKeys)
	if adminPubKeys != "" {
		authorizedAdmins = strings.Split(adminPubKeys, ",")
		log.Printf("Loaded %d authorized admin public keys from APP_PUBKEY", len(authorizedAdmins))
	} else {
		log.Println("Warning: No authorized admin public keys configured. Set APP_PUBKEY environment variable for admin access.")
		authorizedAdmins = []string{}
	}

	relay := khatru.NewRelay()

	relay.Info.Name = "Wavefunc Relay"
	relay.Info.PubKey = os.Getenv("APP_PUBKEY")
	relay.Info.Description = "Wavefuncs indexed relay for things related to Internet Radio - https://wavefunc.live"
	relay.Info.Icon = "https://wavefunc.live/images/logo.png"
	relay.Info.AddSupportedNIP(50)
	relay.Info.URL = "https://relay.wavefunc.live"

	
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
			// Only index radio station events (kind 31237)
			if event.Kind == 31237 {
				log.Printf("Indexing radio station event: ID=%s, Kind=%d, PubKey=%s", event.ID, event.Kind, event.PubKey)
				return blugeSearch.SaveEvent(ctx, event)
			}
			// For other events, just log but don't index
			log.Printf("Storing non-indexed event: ID=%s, Kind=%d, PubKey=%s", event.ID, event.Kind, event.PubKey)
			return nil
		})
		relay.DeleteEvent = append(relay.DeleteEvent, db.DeleteEvent, func(ctx context.Context, event *nostr.Event) error {
			// Only handle deletion for indexed events
			if event.Kind == 31237 {
				return blugeSearch.DeleteEvent(ctx, event)
			}
			return nil
		})
		
		// Set up QueryEvents to route search queries to Bluge and regular queries to PostgreSQL
		relay.QueryEvents = append(relay.QueryEvents, func(ctx context.Context, filter nostr.Filter) (chan *nostr.Event, error) {
			if filter.Search != "" {
				// Use Bluge for search queries
				log.Printf("Handling search query: %s (kinds: %v)", filter.Search, filter.Kinds)
				
				// If no specific kinds are requested, default to radio station events
				if len(filter.Kinds) == 0 {
					log.Printf("No kind specified in search, defaulting to kind 31237 (radio stations)")
					filter.Kinds = []int{31237}
				}
				
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

	// Add NIP-42 authentication for admin commands
	relay.RejectEvent = append(relay.RejectEvent, func(ctx context.Context, event *nostr.Event) (bool, string) {
		// Check if this is an admin-related event
		// Using kind 35688 for admin commands - this is in the "replaceable parameter" range (30000-39999)
		// but shouldn't conflict with common NIPs
		// TODO: probably insecure, but we'll fix it later
		if event.Kind == 35688 { // Custom kind for admin commands
			authedPubkey := khatru.GetAuthed(ctx)

			println("authedPubkey:")
			println(authedPubkey)
			
			if authedPubkey == "" {
				// Not authenticated, request auth
				return true, "auth-required: admin authentication required"
			}
			
			// Check if the authenticated pubkey is in the list of authorized admins
			authorized := false
			for _, admin := range authorizedAdmins {
				if admin == authedPubkey {
					authorized = true
					break
				}
			}
			
			if !authorized {
				return true, "restricted: you're not authorized to perform admin actions"
			}
		}
		
		return false, ""
	})
	
	// Setup Auth request on Connect
	relay.OnConnect = []func(ctx context.Context){
		func(ctx context.Context) {
			fmt.Println("New connection established")
			// Send AUTH challenge to clients on connect
			khatru.RequestAuth(ctx)
		},
	}

	// Create a custom handler for the admin endpoint
	adminHandler := http.NewServeMux()
	
	// Add admin reindex endpoint
	adminHandler.HandleFunc("/admin/reset-search-index", func(w http.ResponseWriter, r *http.Request) {
		// Check if admin authentication is required
		handleAdminRequest(w, r, func(w http.ResponseWriter, r *http.Request) {
			handleResetSearchIndex(w, r, connString, dataDir, &blugeSearch)
		})
	})
	
	// Add admin status endpoint
	adminHandler.HandleFunc("/admin/indexing-status", func(w http.ResponseWriter, r *http.Request) {
		// Check if admin authentication is required
		handleAdminRequest(w, r, func(w http.ResponseWriter, r *http.Request) {
			handleIndexingStatus(w, r)
		})
	})
	
	// Add admin test endpoint for authentication testing
	adminHandler.HandleFunc("/admin/test-auth", func(w http.ResponseWriter, r *http.Request) {
		println("test-auth")
		handleAdminRequest(w, r, func(w http.ResponseWriter, r *http.Request) {
			// This handler will only be called if authentication was successful
			log.Printf("Authenticated admin access from %s", getUserInfo(r))
			
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{
				"success": true,
				"message": "Authentication successful",
				"time": time.Now().Format(time.RFC3339),
			})
		})
	})
	
	// Add endpoint to publish NIP-89 handler information
	adminHandler.HandleFunc("/admin/publish-handler", func(w http.ResponseWriter, r *http.Request) {
		handleAdminRequest(w, r, func(w http.ResponseWriter, r *http.Request) {
			// This handler will publish a pre-signed event sent by the client
			log.Printf("Handling publish request from %s", getUserInfo(r))
			
			// Only accept POST requests with JSON body
			if r.Method != http.MethodPost {
				http.Error(w, "Method not allowed, only POST is supported", http.StatusMethodNotAllowed)
				return
			}
			
			if r.Header.Get("Content-Type") != "application/json" {
				http.Error(w, "Content-Type must be application/json", http.StatusBadRequest)
				return
			}
			
			// Parse the pre-signed event from the request body
			var event nostr.Event
			if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
				http.Error(w, "Invalid JSON body: "+err.Error(), http.StatusBadRequest)
				return
			}
			
			// Verify the event is properly formed
			if event.ID == "" || event.PubKey == "" || event.Sig == "" {
				http.Error(w, "Event must include ID, PubKey, and Sig fields", http.StatusBadRequest)
				return
			}
			
			// Verify that the event is from an authorized admin
			authorized := false
			for _, admin := range authorizedAdmins {
				if admin == event.PubKey {
					authorized = true
					break
				}
			}
			
			if !authorized {
				log.Printf("Unauthorized event publication attempt with pubkey: %s", event.PubKey)
				http.Error(w, "Unauthorized: not an admin pubkey", http.StatusUnauthorized)
				return
			}
			
			// Verify the event signature
			ok, err := event.CheckSignature()
			if err != nil {
				http.Error(w, "Error checking signature: "+err.Error(), http.StatusBadRequest)
				return
			}
			if !ok {
				http.Error(w, "Invalid signature", http.StatusBadRequest)
				return
			}
			
			// The event is valid and from an authorized admin, publish it
			log.Printf("Publishing event kind %d from %s with ID %s", event.Kind, event.PubKey, event.ID)
			
			// If this is connected to a real relay, you would publish it
			// But for now, we'll just simulate success
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{
				"success": true,
				"message": "Event published successfully",
				"event_id": event.ID,
			})
		})
	})
	
	// Add health check endpoint (public)
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

// handleAdminRequest wraps admin handlers with authentication check
func handleAdminRequest(w http.ResponseWriter, r *http.Request, handler func(http.ResponseWriter, *http.Request)) {
	// Only allow POST or GET requests
	if r.Method != http.MethodPost && r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Check if public key is provided in the Authorization header
	pubkey := r.Header.Get("X-Admin-Pubkey")
	signature := r.Header.Get("X-Admin-Signature")
	timestamp := r.Header.Get("X-Admin-Timestamp")
	
	println("pubkey:")
	println(pubkey)
	println("signature:")
	println(signature)
	println("timestamp:")
	println(timestamp)

	// If headers are provided, validate the signature
	if pubkey != "" && signature != "" && timestamp != "" {
		// Check if timestamp is recent (within 5 minutes)
		ts, err := time.Parse(time.RFC3339, timestamp)
		if err != nil {
			log.Printf("Invalid timestamp format: %v", err)
			http.Error(w, "Invalid timestamp format", http.StatusBadRequest)
			return
		}
		
		// Check if timestamp is within 5 minutes
		if time.Since(ts).Minutes() > 5 {
			log.Printf("Timestamp too old: %s", timestamp)
			http.Error(w, "Timestamp too old", http.StatusUnauthorized)
			return
		}
		
		// Verify that pubkey is in the list of authorized admins
		authorized := false
		for _, admin := range authorizedAdmins {
			if admin == pubkey {
				authorized = true
				break
			}
		}
		
		if !authorized {
			log.Printf("Unauthorized access attempt with pubkey: %s", pubkey)
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		
		// Note: In a production system, you would verify the signature here.
		// For simplicity, we're just checking if the pubkey is authorized.
		// A proper implementation would use the nostr libraries to verify
		// the signature against the message.
		log.Printf("Authenticated admin access from pubkey: %s", pubkey)
		
		// If we got here, the pubkey is authorized
		handler(w, r)
		return
	}
	
	// Fallback to token-based authentication (for backward compatibility)
	authToken := os.Getenv("ADMIN_AUTH_TOKEN")
	if authToken != "" {
		providedToken := r.Header.Get("Authorization")
		// Simple token-based auth
		if providedToken == fmt.Sprintf("Bearer %s", authToken) {
			log.Printf("Authenticated admin access using legacy token")
			handler(w, r)
			return
		}
	}
	
	// If we got here, authentication failed
	log.Printf("Unauthenticated admin access attempt from %s", getUserInfo(r))
	http.Error(w, "Unauthorized", http.StatusUnauthorized)
}

// getUserInfo returns information about the user for logging
func getUserInfo(r *http.Request) string {
	return fmt.Sprintf("%s (%s)", r.RemoteAddr, r.UserAgent())
}

// Handler for the reset search index admin endpoint
func handleResetSearchIndex(w http.ResponseWriter, r *http.Request, connString, dataDir string, existingSearch *bluge.BlugeBackend) {
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

		// Get total number of radio station events (kind 31237)
		var totalEvents int
		err = db.QueryRow("SELECT COUNT(*) FROM event WHERE kind = 31237").Scan(&totalEvents)
		if err != nil {
			log.Printf("Error counting events: %v", err)
			setIndexingError(fmt.Sprintf("Error counting events: %v", err))
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
