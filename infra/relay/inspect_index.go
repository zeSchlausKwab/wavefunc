//go:build ignore
// +build ignore

package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/blugelabs/bluge"
)

// This script inspects a Bluge index and runs test queries against it.
// Usage: go run inspect_index.go --dir="./data" --query="your search term"
func main() {
	// Parse command line flags
	dataDir := flag.String("dir", "./data", "Data directory for the Bluge index")
	query := flag.String("query", "", "Search query to test (optional)")
	count := flag.Bool("count", false, "Just count documents in the index")
	fields := flag.Bool("fields", false, "List document field names")
	limit := flag.Int("limit", 10, "Limit search results")
	flag.Parse()

	// Construct the index path
	indexPath := *dataDir + "/bluge_search"
	if _, err := os.Stat(indexPath); os.IsNotExist(err) {
		log.Fatalf("Error: Index directory doesn't exist: %s", indexPath)
	}

	// Open the index for reading
	config := bluge.DefaultConfig(indexPath)
	reader, err := bluge.OpenReader(config)
	if err != nil {
		log.Fatalf("Error opening Bluge index: %v", err)
	}
	defer reader.Close()

	ctx := context.Background()

	// If just counting documents
	if *count {
		docCount, err := reader.Count()
		if err != nil {
			log.Fatalf("Error counting documents: %v", err)
		}
		fmt.Printf("Total documents in index: %d\n", docCount)
		return
	}

	// If we have a query, search the index
	if *query != "" {
		fmt.Printf("Searching for: %s\n", *query)

		// Create a more complex query that searches across multiple fields
		// similar to how the actual search implementation works
		boolQuery := bluge.NewBooleanQuery()
		
		// Add search across all the important fields
		fields := []struct{
			name string
			boost float64
		}{
			{"content", 1.5},
			{"description", 1.5},
			{"station_name_text", 2.0},
			{"genre_text", 1.2},
			{"location", 1.0},
			{"tag_name", 1.8}, // Fall back to the tag_name field
		}
		
		for _, field := range fields {
			// Term query (exact match)
			termQuery := bluge.NewTermQuery(*query).SetField(field.name)
			termQuery.SetBoost(field.boost * 1.5)
			boolQuery.AddShould(termQuery)
			
			// Match query (analyzed)
			matchQuery := bluge.NewMatchQuery(*query).SetField(field.name)
			matchQuery.SetBoost(field.boost)
			boolQuery.AddShould(matchQuery)
			
			// Wildcard queries
			wildcardQuery := bluge.NewWildcardQuery("*"+*query+"*").SetField(field.name)
			wildcardQuery.SetBoost(field.boost * 0.8)
			boolQuery.AddShould(wildcardQuery)
		}

		// Create a search request
		searchRequest := bluge.NewTopNSearch(*limit, boolQuery).
			SortBy([]string{"-created_at"})

		// Execute search
		dmi, err := reader.Search(ctx, searchRequest)
		if err != nil {
			log.Fatalf("Error searching index: %v", err)
		}

		fmt.Println("\nSearch Results:")
		fmt.Println("---------------------------------------------------")

		// Iterate through results
		count := 0
		match, err := dmi.Next()
		for err == nil && match != nil {
			count++
			
			// Extract stored fields
			var id, content, pubkey, stationName, tagName string
			var createdAt float64
			var kind float64
			
			match.VisitStoredFields(func(field string, value []byte) bool {
				switch field {
				case "id":
					id = string(value)
				case "content":
					content = string(value)
				case "pubkey":
					pubkey = string(value)
				case "created_at":
					createdAt = float64(0)
					fmt.Sscanf(string(value), "%f", &createdAt)
				case "kind":
					kind = float64(0)
					fmt.Sscanf(string(value), "%f", &kind)
				case "station_name":
					stationName = string(value)
				case "tag_name":
					tagName = string(value)
				}
				return true
			})
			
			// Format the creation time
			timeStr := "unknown"
			if createdAt > 0 {
				t := time.Unix(int64(createdAt), 0)
				timeStr = t.Format("2006-01-02 15:04:05")
			}
			
			// Print out result info
			fmt.Printf("Result #%d:\n", count)
			fmt.Printf("  ID: %s\n", id)
			fmt.Printf("  PubKey: %s\n", pubkey)
			fmt.Printf("  Kind: %.0f\n", kind)
			fmt.Printf("  Created: %s\n", timeStr)
			if stationName != "" {
				fmt.Printf("  Station Name: %s\n", stationName)
			}
			if tagName != "" {
				fmt.Printf("  Tag Name: %s\n", tagName)
			}
			fmt.Printf("  Content: %s\n", content)
			fmt.Println("---------------------------------------------------")
			
			match, err = dmi.Next()
		}
		
		if err != nil {
			fmt.Printf("Error iterating results: %v\n", err)
		}
		
		if count == 0 {
			fmt.Println("No results found")
		} else {
			fmt.Printf("Found %d results\n", count)
		}
		return
	}

	// If analyzing field names
	if *fields {
		// Use MatchAll to get all documents, but limit to avoid memory issues
		query := bluge.NewMatchAllQuery()
		req := bluge.NewTopNSearch(1, query)
		
		dmi, err := reader.Search(ctx, req)
		if err != nil {
			log.Fatalf("Error searching index: %v", err)
		}
		
		// Get first document to analyze fields
		match, err := dmi.Next()
		if err != nil || match == nil {
			log.Fatalf("Error getting document: %v", err)
		}
		
		// Collect field names
		fields := make(map[string]bool)
		match.VisitStoredFields(func(field string, value []byte) bool {
			fields[field] = true
			return true
		})
		
		// Print field names
		fmt.Println("Index contains the following fields:")
		for field := range fields {
			fmt.Printf("  - %s\n", field)
		}
		return
	}

	// Default action - print basic index info
	docCount, err := reader.Count()
	if err != nil {
		log.Fatalf("Error counting documents: %v", err)
	}
	
	fmt.Printf("Bluge Index at: %s\n", indexPath)
	fmt.Printf("Total documents: %d\n", docCount)
	fmt.Println("\nUse --query=\"search term\" to search the index")
	fmt.Println("Use --count to just count the documents")
	fmt.Println("Use --fields to list document field names")
} 