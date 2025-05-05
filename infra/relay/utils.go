package main

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"github.com/nbd-wtf/go-nostr"
)

// sanitizeSearchQuery cleans search input to avoid Bluge crashes
func sanitizeSearchQuery(query string) string {
	// Trim whitespace
	clean := strings.TrimSpace(query)
	
	// Check if it's empty after trimming
	if clean == "" {
		return ""
	}
	
	// Remove potentially problematic characters
	problematicChars := []string{
		"\\", "(", ")", "[", "]", "{", "}", "^", "~", ":", "!", "&", "|",
	}
	
	for _, char := range problematicChars {
		// Either escape the character properly or remove it if causing issues
		clean = strings.ReplaceAll(clean, char, " ")
	}
	
	// Remove duplicate spaces
	for strings.Contains(clean, "  ") {
		clean = strings.ReplaceAll(clean, "  ", " ")
	}
	
	// Final trim in case we added spaces at edges
	clean = strings.TrimSpace(clean)
	
	// If sanitization emptied the query, return empty string
	if clean == "" {
		return ""
	}
	
	// Log what we've done for debugging
	if clean != query {
		log.Printf("Sanitized search query: %q → %q", query, clean)
	}
	
	return clean
}

// extractEventMetadata extracts important metadata from an event's tags
func extractEventMetadata(event *nostr.Event) (name, description string, genres, languages []string) {
	// Extract name and other metadata from tags
	for _, tag := range event.Tags {
		if len(tag) >= 2 {
			switch tag[0] {
			case "name":
				name = tag[1]
			case "t": // Genre/tag
				genres = append(genres, tag[1])
			case "language": // Only use the new language tag format per updated SPEC.md
				languages = append(languages, tag[1])
			}
		}
	}
	
	// Try to parse and extract useful content from JSON
	if strings.HasPrefix(strings.TrimSpace(event.Content), "{") {
		var contentData map[string]interface{}
		if err := json.Unmarshal([]byte(event.Content), &contentData); err == nil {
			// Successfully parsed JSON, extract description if available
			if desc, ok := contentData["description"].(string); ok {
				description = desc
			}
		}
	}
	
	return name, description, genres, languages
}

// createSearchableContent creates the searchable content for indexing
func createSearchableContent(name, description string, genres, languages []string) (string, string) {
	// Create a combined searchable text field with higher weight for name
	// Format: {NAME}|{NAME}|{DESCRIPTION}|{GENRES}|{LANGUAGES}
	// Duplicate the name to give it higher weight in search results
	searchableContent := fmt.Sprintf("%s|%s|%s|%s|%s", 
		strings.ToLower(name),       // Name (lowercase)
		strings.ToLower(name),       // Name repeated for higher weight
		strings.ToLower(description), // Description
		strings.ToLower(strings.Join(genres, " ")),  // Genres
		strings.ToLower(strings.Join(languages, " "))) // Languages

	// Create a separate index for name-only searches
	nameOnlyContent := strings.ToLower(name)
	
	return searchableContent, nameOnlyContent
} 