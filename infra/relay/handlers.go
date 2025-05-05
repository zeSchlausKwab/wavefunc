package main

import (
	"net/http"
	"strings"

	"github.com/fiatjaf/eventstore/bluge"
	"github.com/fiatjaf/khatru"
)

// SetupHandlers configures all the HTTP handlers for the relay
func SetupHandlers(relay *khatru.Relay, blugeSearch *bluge.BlugeBackend, connString, dataDir string) http.Handler {
	// Create a custom handler for the admin endpoint
	adminHandler := http.NewServeMux()
	
	// Add admin reindex endpoint
	adminHandler.HandleFunc("/admin/reset-search-index", func(w http.ResponseWriter, r *http.Request) {
		// Check if admin authentication is required
		HandleAdminRequest(w, r, func(w http.ResponseWriter, r *http.Request) {
			// After updating the indexing code to include _name_searchable tags,
			// the search index needs to be rebuilt for the changes to take effect
			HandleResetSearchIndex(w, r, connString, dataDir, blugeSearch)
		})
	})
	
	// Add admin status endpoint
	adminHandler.HandleFunc("/admin/indexing-status", func(w http.ResponseWriter, r *http.Request) {
		// Check if admin authentication is required
		HandleAdminRequest(w, r, func(w http.ResponseWriter, r *http.Request) {
			HandleIndexingStatus(w, r)
		})
	})
	
	// Add admin endpoint for inspecting search index
	adminHandler.HandleFunc("/admin/inspect-search", func(w http.ResponseWriter, r *http.Request) {
		HandleAdminRequest(w, r, func(w http.ResponseWriter, r *http.Request) {
			HandleInspectSearch(w, r, blugeSearch)
		})
	})
	
	// Add admin test endpoint for authentication testing
	adminHandler.HandleFunc("/admin/test-auth", func(w http.ResponseWriter, r *http.Request) {
		HandleAdminRequest(w, r, func(w http.ResponseWriter, r *http.Request) {
			HandleTestAuth(w, r)
		})
	})
	
	// Add endpoint to publish NIP-89 handler information
	adminHandler.HandleFunc("/admin/publish-handler", func(w http.ResponseWriter, r *http.Request) {
		HandleAdminRequest(w, r, func(w http.ResponseWriter, r *http.Request) {
			HandlePublishHandler(w, r)
		})
	})
	
	// Add health check endpoint (public)
	adminHandler.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		HandleHealthCheck(w, r)
	})

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

	return combinedHandler
} 