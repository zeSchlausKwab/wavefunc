package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/fiatjaf/eventstore/bluge"
	"github.com/fiatjaf/eventstore/postgresql"
	"github.com/fiatjaf/khatru"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"github.com/nbd-wtf/go-nostr"
)

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

	// Load .env file from parent directories
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

	fmt.Println("connString:")
	fmt.Println(connString)
	
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
	
	// Initialize the original Bluge search backend
	originalBlugeSearch := bluge.BlugeBackend{
		Path:          blugeSearchPath,
		RawEventStore: &db,
	}
	
	// Variable to hold the HTTP handler
	var handler http.Handler
	
	if err := originalBlugeSearch.Init(); err != nil {
		fmt.Printf("Error initializing Bluge search: %v\n", err)
		// Continue without search functionality
		// Set up handler without search functionality
		handler = SetupHandlers(relay, &originalBlugeSearch, connString, dataDir)
	} else {
		defer originalBlugeSearch.Close()
		
		// Create our enhanced wrapper around the original Bluge backend
		blugeSearch := NewWavefuncBlugeWrapper(&originalBlugeSearch)
		
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
				return blugeSearch.BlugeBackend.DeleteEvent(ctx, event)
			}
			return nil
		})
		
		// Set up QueryEvents to route search queries to Bluge and regular queries to PostgreSQL
		relay.QueryEvents = append(relay.QueryEvents, func(ctx context.Context, filter nostr.Filter) (chan *nostr.Event, error) {
			if filter.Search != "" {
				// Use our dedicated search module
				return QueryWithSearch(ctx, blugeSearch.BlugeBackend, filter)
			} else {
				// Use PostgreSQL for regular queries
				return db.QueryEvents(ctx, filter)
			}
		})
		
		// Set up all HTTP handlers with our enhanced search capability
		handler = SetupHandlers(relay, blugeSearch.BlugeBackend, connString, dataDir)
	}

	// Add NIP-42 authentication for admin commands
	relay.RejectEvent = append(relay.RejectEvent, func(ctx context.Context, event *nostr.Event) (bool, string) {
		// Check if this is an admin-related event
		// Using kind 35688 for admin commands - this is in the "replaceable parameter" range (30000-39999)
		if event.Kind == 35688 { // Custom kind for admin commands
			authedPubkey := khatru.GetAuthed(ctx)
			
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

	// Get PORT from environment (Railway sets this automatically)
	port := os.Getenv("PORT")
	if port == "" {
		// Fallback to RELAY_PORT if PORT is not set
		port = os.Getenv("VITE_PUBLIC_RELAY_PORT")
		if port == "" {
			port = "3002"
		}
	}

	fmt.Printf("Running on :%s with admin endpoints\n", port)
	err := http.ListenAndServe("0.0.0.0:"+port, handler)
	if err != nil {
		panic(err)
	}
}
