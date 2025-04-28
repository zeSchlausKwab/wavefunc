# Nostr Radio Favorites Implementation

This document explains how the favorites functionality in NostrRadio has been implemented to comply with the specification in SPEC.md.

## Favorites Event Structure (kind 30078)

In accordance with SPEC.md, favorites are implemented as follows:

### Content Format

The content field is a JSON string with the following structure:

```json
{
    "name": "My Favorite Stations",
    "description": "A collection of my favorite radio stations"
}
```

This keeps the content simple and focused on list metadata, not the list items themselves.

### Tags Format

Favorites are stored using 'a' tags with the following format:

```
['a', event_id, relay_url?, petname?, added_at?]
```

Where:

- `event_id`: The event ID or address of the favorited station
- `relay_url` (optional): Hint for where to find the station event
- `petname` (optional): User-assigned name for the station
- `added_at` (optional): Unix timestamp when the station was added

Additionally, the event includes these tags:

- `d` tag: Unique identifier for the list
- `l` tag: Set to "radio_favorites" to identify this as a radio favorites list
- `name`: List name (duplicated from content for compatibility)
- `description`: List description (duplicated from content for compatibility)
- `t`: Set to "favorites" for categorization

## Implementation Details

The system has been designed to:

1. Store favorites in tags, not in content
2. Properly parse and handle all optional fields in 'a' tags
3. Support fallback methods for retrieving station data using relay hints
4. Ensure events are properly replaceable using d-tags

## Component Integration

The UI components have been updated to work with this structure:

- `FavoritesManager.tsx`: Displays favorites lists and their contents
- `EditFavoritesListDrawer.tsx`: Allows creation/editing of favorites lists

## Functions

Key functions for working with favorites:

- `createFavoritesEvent()`: Creates a properly formatted favorites event
- `publishFavoritesList()`: Creates and publishes a new favorites list
- `updateFavoritesList()`: Updates an existing favorites list
- `addStationToFavorites()`: Adds a station to a favorites list
- `removeStationFromFavorites()`: Removes a station from a favorites list
- `parseFavoritesEvent()`: Parses a favorites event into a structured object

The implementation follows the Nostr best practices and ensures interoperability with other clients that support the same specification.
