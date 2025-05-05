package main

import (
	"context"
	"log"
	"strings"

	blugestore "github.com/fiatjaf/eventstore/bluge"
	"github.com/nbd-wtf/go-nostr"
)

// WavefuncBlugeWrapper wraps the original Bluge backend with enhanced search capabilities
type WavefuncBlugeWrapper struct {
	// Embed the original BlugeBackend
	*blugestore.BlugeBackend
}

// NewWavefuncBlugeWrapper creates a new instance of our enhanced Bluge wrapper
func NewWavefuncBlugeWrapper(original *blugestore.BlugeBackend) *WavefuncBlugeWrapper {
	return &WavefuncBlugeWrapper{
		BlugeBackend: original,
	}
}

// SaveEvent overrides the original SaveEvent method to enhance searchability
func (w *WavefuncBlugeWrapper) SaveEvent(ctx context.Context, evt *nostr.Event) error {
	// Only enhance radio station events (kind 31237)
	if evt.Kind == 31237 {
		// Extract name, description, and other metadata
		name, description, genres, languages := extractEventMetadata(evt)
		
		// Create an enhanced searchable string combining name, description, genres and languages
		searchableContent := name + " " + name + " " + description // Adding name twice to weight it higher
		
		// Add genres and languages
		if len(genres) > 0 {
			searchableContent += " " + strings.Join(genres, " ")
		}
		if len(languages) > 0 {
			searchableContent += " " + strings.Join(languages, " ")
		}
		
		// Convert to lowercase for case-insensitive searching
		searchableContent = strings.ToLower(searchableContent)
		
		log.Printf("Enhanced content for event ID=%s, Name=%s, Content length: %d", evt.ID, name, len(searchableContent))
		
		// Since we can't directly access the writer, we'll use the original BlugeBackend's SaveEvent
		// but with our modified event with enhanced searchable content
		enhancedEvent := *evt
		enhancedEvent.Content = searchableContent
		
		// Use the original SaveEvent method
		return w.BlugeBackend.SaveEvent(ctx, &enhancedEvent)
	}
	
	// For non-radio events, use the standard implementation
	return w.BlugeBackend.SaveEvent(ctx, evt)
} 