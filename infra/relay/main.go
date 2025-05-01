package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/fiatjaf/eventstore/bluge"
	"github.com/fiatjaf/eventstore/postgresql"
	"github.com/fiatjaf/khatru"
	"github.com/joho/godotenv"
	"github.com/nbd-wtf/go-nostr"
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
		relay.StoreEvent = append(relay.StoreEvent, db.SaveEvent, blugeSearch.SaveEvent)
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

	// Get PORT from environment (Railway sets this automatically)
	port := os.Getenv("PORT")
	if port == "" {
		// Fallback to RELAY_PORT if PORT is not set
		port = os.Getenv("VITE_PUBLIC_RELAY_PORT")
		if port == "" {
			port = "3002"
		}
	}

	fmt.Printf("running on :%s\n", port)
	err := http.ListenAndServe("0.0.0.0:"+port, relay)
	if err != nil {
		panic(err)
	}
}
