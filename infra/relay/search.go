package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/fiatjaf/eventstore/bluge"
	"github.com/nbd-wtf/go-nostr"
)

// QueryWithSearch handles search queries by using Bluge for search operations
func QueryWithSearch(ctx context.Context, blugeSearch *bluge.BlugeBackend, filter nostr.Filter) (chan *nostr.Event, error) {
	log.Printf("Handling search query: %s (kinds: %v)", filter.Search, filter.Kinds)
	
	// If no specific kinds are requested, default to radio station events
	if len(filter.Kinds) == 0 {
		log.Printf("No kind specified in search, defaulting to kind 31237 (radio stations)")
		filter.Kinds = []int{31237}
	}
	
	// Create a buffered channel to collect and log the results
	resultChan := make(chan *nostr.Event)
	
	// Wrap the search in a recovery function to prevent panics
	go func() {
		defer close(resultChan)
		defer func() {
			if r := recover(); r != nil {
				log.Printf("RECOVERED from search panic: %v", r)
			}
		}()
		
		// Sanitize search input to avoid Bluge crashes
		safeSearch := sanitizeSearchQuery(filter.Search)
		if safeSearch == "" {
			log.Printf("Warning: Search query was sanitized to empty string, using simple match")
			// If sanitized to empty, use a simple filter without search
			events, err := blugeSearch.RawEventStore.QueryEvents(ctx, filter)
			if err != nil {
				log.Printf("Error in fallback query: %v", err)
				return
			}
			
			count := 0
			for event := range events {
				count++
				resultChan <- event
			}
			log.Printf("Fallback query completed, returned %d results", count)
			return
		}
		
		// Update the filter with the sanitized search and enhancements
		safeFilter := filter
		
		// Convert the search to lowercase to match our indexed lowercase content
		lowerSearch := strings.ToLower(safeSearch)
		
		// First, check if we have stations that match exactly by name
		// This ensures name matches are always prioritized at the top
		log.Printf("Searching for exact name matches for: %s", lowerSearch)
		exactNameMatches := 0
		exactMatchIDs := make(map[string]bool)
		
		// First search exact name matches - these should appear first in results
		for event := range GetExactNameMatches(ctx, blugeSearch, lowerSearch, filter.Kinds) {
			exactNameMatches++
			exactMatchIDs[event.ID] = true
			resultChan <- event
			
			// Log the match details
			name := ""
			for _, tag := range event.Tags {
				if len(tag) >= 2 && tag[0] == "name" {
					name = tag[1]
					break
				}
			}
			log.Printf("Exact name match #%d: ID=%s, Name=%s", exactNameMatches, event.ID, name)
			
			// Limit exact matches to avoid overwhelming the results
			if exactNameMatches >= 10 {
				break
			}
		}
		
		log.Printf("Found %d exact name matches", exactNameMatches)
		
		// Now set up the search for all other matches
		safeFilter.Search = lowerSearch
		
		// Try the Bluge search with error handling
		events, err := blugeSearch.QueryEvents(ctx, safeFilter)
		if err != nil {
			log.Printf("Error in Bluge search: %v, falling back to regular query", err)
			// Fall back to PostgreSQL for regular queries
			fallbackEvents, fallbackErr := blugeSearch.RawEventStore.QueryEvents(ctx, filter)
			if fallbackErr != nil {
				log.Printf("Error in fallback query too: %v", fallbackErr)
				return
			}
			
			count := 0
			for event := range fallbackEvents {
				count++
				resultChan <- event
			}
			log.Printf("Fallback query completed, returned %d results", count)
			return
		}
		
		// Process the search results
		count := 0
		// Keep track of IDs we've already sent to avoid duplicates from exact name matches
		for event := range events {
			// Skip if we already sent this event via exact name match
			if exactMatchIDs[event.ID] {
				continue
			}
			
			count++
			log.Printf("Search result #%d: ID=%s, Kind=%d", count, event.ID, event.Kind)
			
			// Extract name for logging
			name := ""
			for _, tag := range event.Tags {
				if len(tag) >= 2 && tag[0] == "name" {
					name = tag[1]
					break
				}
			}
			
			// Find the _searchable tag to log how it matched
			searchableContent := ""
			for _, tag := range event.Tags {
				if len(tag) >= 2 && tag[0] == "_searchable" {
					searchableContent = tag[1]
					break
				}
			}
			
			if name != "" || searchableContent != "" {
				log.Printf("Match details - Name: %s, Searchable: %s, Query: %s", name, searchableContent, lowerSearch)
			}
			
			resultChan <- event
		}
		log.Printf("Search query completed, returned %d regular results + %d exact name matches = %d total", 
		           count, exactNameMatches, count + exactNameMatches)
	}()
	
	return resultChan, nil
}

// GetExactNameMatches returns events where the name tag exactly matches the search term
// This helps prioritize exact name matches over partial matches in description or tags
func GetExactNameMatches(ctx context.Context, searchBackend *bluge.BlugeBackend, searchTerm string, kinds []int) chan *nostr.Event {
	resultChan := make(chan *nostr.Event)
	
	go func() {
		defer close(resultChan)
		
		// Create a specialized filter for exact name matches
		nameFilter := nostr.Filter{
			Kinds: kinds,
		}
		
		// Use the search backend directly
		events, err := searchBackend.QueryEvents(ctx, nameFilter)
		if err != nil {
			log.Printf("Error finding exact name matches: %v", err)
			return
		}
		
		// Process events and find those with exact name matches using the dedicated name index
		for event := range events {
			exactMatch := false
			
			// First check the dedicated name searchable tag which is more reliable
			for _, tag := range event.Tags {
				if len(tag) >= 2 && tag[0] == "_name_searchable" {
					// Exact match on the name-only index (case insensitive)
					if tag[1] == searchTerm {
						exactMatch = true
						log.Printf("Found exact name match using _name_searchable: %s", tag[1])
						break
					}
					
					// Check if search terms are contained in the name (partial match)
					// This is useful for multi-word searches
					if strings.Contains(tag[1], searchTerm) {
						exactMatch = true
						log.Printf("Found partial name match using _name_searchable: %s contains %s", tag[1], searchTerm)
						break
					}
				}
			}
			
			// Fall back to checking the name tag if we don't have a match yet
			if !exactMatch {
				for _, tag := range event.Tags {
					if len(tag) >= 2 && tag[0] == "name" {
						// Check for case-insensitive exact match
						if strings.ToLower(tag[1]) == searchTerm {
							exactMatch = true
							log.Printf("Found exact name match using name tag: %s", tag[1])
							break
						}
						
						// Check if search term is contained in the name (partial match)
						if strings.Contains(strings.ToLower(tag[1]), searchTerm) {
							exactMatch = true
							log.Printf("Found partial name match using name tag: %s contains %s", tag[1], searchTerm)
							break
						}
					}
				}
			}
			
			// Send this event if it's an exact match
			if exactMatch {
				resultChan <- event
			}
		}
	}()
	
	return resultChan
}

// handleInspectSearch handles the admin endpoint for inspecting search results
func HandleInspectSearch(w http.ResponseWriter, r *http.Request, blugeSearch *bluge.BlugeBackend) {
	// Parse query parameters
	query := r.URL.Query().Get("q")
	if query == "" {
		http.Error(w, "Missing required 'q' parameter", http.StatusBadRequest)
		return
	}
	
	// Sanitize the query
	query = sanitizeSearchQuery(query)
	if query == "" {
		http.Error(w, "Invalid search query after sanitization", http.StatusBadRequest)
		return
	}
	
	// Get optional limit parameter
	limitStr := r.URL.Query().Get("limit")
	limit := 20 // Default
	if limitStr != "" {
		parsedLimit, err := strconv.Atoi(limitStr)
		if err == nil && parsedLimit > 0 {
			limit = parsedLimit
		}
	}
	
	log.Printf("Performing search index inspection for query: %q with limit: %d", query, limit)
	
	// Create response with streaming to avoid timeouts on large results
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming not supported", http.StatusInternalServerError)
		return
	}
	
	// Start response
	fmt.Fprintf(w, "{\n  \"query\": %q,\n  \"results\": [\n", query)
	flusher.Flush()
	
	// Perform search
	ctx := context.Background()
	inspectResults, err := blugeSearch.QueryEvents(ctx, nostr.Filter{
		Kinds: []int{31237},
		Search: query,
		Limit: limit,
	})
	
	if err != nil {
		// End JSON response with error
		fmt.Fprintf(w, "  ],\n  \"error\": %q,\n  \"count\": 0\n}", err.Error())
		flusher.Flush()
		log.Printf("Error inspecting search index: %v", err)
		return
	}
	
	// Process results
	count := 0
	first := true
	
	for event := range inspectResults {
		if !first {
			fmt.Fprintf(w, ",\n")
		} else {
			first = false
		}
		
		// Extract metadata for display
		name := ""
		description := ""
		var genres []string
		
		// Extract name tag
		for _, tag := range event.Tags {
			if len(tag) >= 2 {
				if tag[0] == "name" {
					name = tag[1]
				} else if tag[0] == "t" {
					genres = append(genres, tag[1])
				}
			}
		}
		
		// Try to extract description from content
		if strings.HasPrefix(strings.TrimSpace(event.Content), "{") {
			var contentData map[string]interface{}
			if err := json.Unmarshal([]byte(event.Content), &contentData); err == nil {
				if desc, ok := contentData["description"].(string); ok {
					description = desc
				}
			}
		}
		
		// Write event to output
		resultJSON, _ := json.Marshal(map[string]interface{}{
			"id": event.ID,
			"pubkey": event.PubKey,
			"created_at": event.CreatedAt,
			"kind": event.Kind,
			"name": name,
			"description": description,
			"genres": genres,
			"match_query": query,
		})
		
		fmt.Fprintf(w, "    %s", string(resultJSON))
		flusher.Flush()
		
		count++
	}
	
	// Finish response
	fmt.Fprintf(w, "\n  ],\n  \"count\": %d\n}", count)
	flusher.Flush()
	
	log.Printf("Search inspection complete: found %d results for query %q", count, query)
} 