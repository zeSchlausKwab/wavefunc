package main

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"

	"github.com/fiatjaf/eventstore/sqlite3"
	"github.com/fiatjaf/khatru"
	"github.com/joho/godotenv"
)

func main() {
	// Load .env from root
	if err := godotenv.Load(filepath.Join("..", "..", ".env")); err != nil {
		fmt.Printf("Warning: Error loading .env file: %v\n", err)
	}

	relay := khatru.NewRelay()
	// Get DB path from env or use default
	dbPath := os.Getenv("SQLITE_DB_PATH")
	if dbPath == "" {
		dbPath = "./nostr.db" // Default to root directory
	}

	// Ensure the database directory exists
	dbDir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dbDir, 0755); err != nil {
		panic(fmt.Errorf("failed to create database directory: %v", err))
	}

	db := sqlite3.SQLite3Backend{DatabaseURL: dbPath}
	if err := db.Init(); err != nil {
		panic(err)
	}

	relay.StoreEvent = append(relay.StoreEvent, db.SaveEvent)
	relay.QueryEvents = append(relay.QueryEvents, db.QueryEvents)
	relay.CountEvents = append(relay.CountEvents, db.CountEvents)
	relay.DeleteEvent = append(relay.DeleteEvent, db.DeleteEvent)

	port := os.Getenv("RELAY_PORT")
	if port == "" {
		port = "3002"
	}

	fmt.Printf("running on :%s\n", port)
	err := http.ListenAndServe("0.0.0.0:"+port, relay)
	if err != nil {
		panic(err)
	}
}
