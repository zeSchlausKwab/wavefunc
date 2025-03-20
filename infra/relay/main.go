package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/fiatjaf/eventstore/postgresql"
	"github.com/fiatjaf/khatru"
	"github.com/joho/godotenv"
)

func main() {
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

	relay.StoreEvent = append(relay.StoreEvent, db.SaveEvent)
	relay.QueryEvents = append(relay.QueryEvents, db.QueryEvents)
	relay.CountEvents = append(relay.CountEvents, db.CountEvents)
	relay.DeleteEvent = append(relay.DeleteEvent, db.DeleteEvent)

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
