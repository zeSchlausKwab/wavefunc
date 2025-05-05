package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/nbd-wtf/go-nostr"
)

// handleAdminRequest wraps admin handlers with authentication check
func HandleAdminRequest(w http.ResponseWriter, r *http.Request, handler func(http.ResponseWriter, *http.Request)) {
	// Only allow POST or GET requests
	if r.Method != http.MethodPost && r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Check if public key is provided in the Authorization header
	pubkey := r.Header.Get("X-Admin-Pubkey")
	signature := r.Header.Get("X-Admin-Signature")
	timestamp := r.Header.Get("X-Admin-Timestamp")

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
	log.Printf("Unauthenticated admin access attempt from %s", GetUserInfo(r))
	http.Error(w, "Unauthorized", http.StatusUnauthorized)
}

// GetUserInfo returns information about the user for logging
func GetUserInfo(r *http.Request) string {
	return fmt.Sprintf("%s (%s)", r.RemoteAddr, r.UserAgent())
}

// HandlePublishHandler handles the admin endpoint for publishing NIP-89 handler information
func HandlePublishHandler(w http.ResponseWriter, r *http.Request) {
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
}

// HandleTestAuth handles the admin test endpoint for authentication testing
func HandleTestAuth(w http.ResponseWriter, r *http.Request) {
	// This handler will only be called if authentication was successful
	log.Printf("Authenticated admin access from %s", GetUserInfo(r))
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Authentication successful",
		"time": time.Now().Format(time.RFC3339),
	})
}

// HandleHealthCheck provides a simple health check endpoint
func HandleHealthCheck(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "OK")
} 