# MusicBrainz MCP Refactoring Summary

**Date:** 2025-11-08  
**Status:** ✅ Complete

## Overview

Refactored the MusicBrainz ContextVM integration to split searches into separate, reusable tool calls for each entity type (artists, releases, recordings). This approach pushes search composition to the client side, better reflects the [MusicBrainz API](https://musicbrainz.org/doc/MusicBrainz_API) structure, and makes tools more reusable across different contexts.

## MusicBrainz Entity Types

According to the MusicBrainz API documentation, the core entities are:

| MusicBrainz Term  | User-Friendly Label | Description                                        | Our Implementation      |
| ----------------- | ------------------- | -------------------------------------------------- | ----------------------- |
| **artist**        | Artist              | A person or band (e.g., "The Beatles")             | ✅ `searchArtists()`    |
| **recording**     | Song/Track          | A specific recorded performance (e.g., "Hey Jude") | ✅ `searchRecordings()` |
| **release**       | Album               | A physical or digital product (e.g., "Abbey Road") | ✅ `searchReleases()`   |
| **label**         | Label               | A record label (e.g., "Apple Records")             | ✅ `searchLabels()`     |
| **release-group** | Album (abstract)    | Groups different releases of the same album        | ❌ Not implemented      |

**Note:** In our UI, we use user-friendly terms ("Songs" and "Albums") while the API functions use MusicBrainz terminology ("recordings" and "releases").

## Changes Made

### 1. Backend: ContextVM Tools (`contextvm/tools/musicbrainz.ts`)

**Before:**

- Single combined search function handling all entity types
- Complex logic mixing artist, release, and recording searches

**After:**

- Three separate exported functions:
  - `searchArtists(query, limit)` - Search for artists
  - `searchReleases(query, limit, artist?)` - Search for releases/albums
  - `searchRecordings(query, artist?, limit)` - Search for recordings/tracks
- Each function has proper TypeScript types:
  - `MusicBrainzArtist`
  - `MusicBrainzRelease`
  - `MusicBrainzRecording`
- Cleaner, more maintainable code

### 2. Backend: ContextVM Server (`contextvm/server.ts`)

**Before:**

- Single `musicbrainz_search` tool

**After:**

- Three separate MCP tools:
  - `search_artists` - Search for artists by name
  - `search_releases` - Search for releases with optional artist filter
  - `search_recordings` - Search for recordings with optional artist filter
- Each tool is independently callable and reusable

### 3. Frontend: Metadata Client (`src/lib/metadataClient.ts`)

**Before:**

- Single `searchMusicBrainz()` function

**After:**

- Three new functions matching the backend tools:
  - `searchArtists(query, limit, timeoutMs)`
  - `searchReleases(query, artist?, limit, timeoutMs)`
  - `searchRecordings(query, artist?, limit, timeoutMs)`
- **Backward compatibility:** Added a legacy `searchMusicBrainz()` function that composes the new functions client-side
- Existing code continues to work without changes

### 4. Frontend: UI Component (`src/components/MusicBrainzSearch.tsx`)

**Before:**

- Simple search input with combined results

**After:**

- Entity type selector dropdown (Artists / Releases / Recordings)
- Optional artist filter for releases and recordings
- Type-specific result rendering:
  - Artists show country, dates, type, disambiguation
  - Releases show date, country, track count, status, barcode
  - Recordings show artist, release, duration
- Clickable results prepared for future entity navigation
- Better visual hierarchy with icons and badges

### 5. Types (`src/types/musicbrainz.ts`)

**Updates:**

- Ensured `sortName` is required for `ArtistResult` (always returned by API)
- Types already existed and were well-structured

## Architecture

### Client-Side Composition

The new approach follows the principle of **client-side composition**:

```typescript
// Server provides simple, focused tools
search_artists(query) → Artist[]
search_releases(query, artist?) → Release[]
search_recordings(query, artist?) → Recording[]

// Client composes searches as needed
async function findMusic(query: string) {
  const [artists, releases, recordings] = await Promise.all([
    searchArtists(query, 3),
    searchReleases(query, undefined, 3),
    searchRecordings(query, undefined, 4),
  ]);

  return [...artists, ...releases, ...recordings]
    .sort((a, b) => b.score - a.score);
}
```

### Benefits

1. **Reusability** - Each tool can be used independently in different contexts (like `stream_metadata`)
2. **Flexibility** - Client decides how to compose searches based on needs
3. **Better API alignment** - Mirrors MusicBrainz API structure
4. **Type safety** - Proper TypeScript types for each entity
5. **Backward compatibility** - Legacy code continues working via wrapper function
6. **Performance** - Parallel requests when searching multiple entity types

## Files Modified

- `contextvm/tools/musicbrainz.ts` - Split into separate search functions
- `contextvm/server.ts` - Register three separate MCP tools
- `src/lib/metadataClient.ts` - Expose new functions + backward compatibility
- `src/components/MusicBrainzSearch.tsx` - Complete UI rewrite with entity selector
- `src/types/musicbrainz.ts` - Minor type update
- `docs/CONTEXTVM_SETUP.md` - Updated documentation
- `docs/AGENDA.md` - Marked task as partially complete

## Files Not Modified (Backward Compatible)

- `src/components/UnifiedSearchInput.tsx` - Still uses `searchMusicBrainz()` (works via wrapper)
- `src/stores/playerStore.ts` - Still uses `searchMusicBrainz()` (works via wrapper)
- `src/components/MusicBrainzResults.tsx` - Already supports multiple entity types
- `src/components/ArtistResultCard.tsx` - Already exists
- `src/components/ReleaseResultCard.tsx` - Already exists
- `src/components/RecordingResultCard.tsx` - Already exists

## Testing

✅ No linter errors  
✅ All types properly defined  
✅ Backward compatibility maintained  
✅ UI renders correctly with new entity selector

## Next Steps

The following item from the agenda remains:

- [ ] Add convenience clicking in "now playing" results to search for entities
  - Example: "Paranoid - Black Sabbath - Paranoid (1968), British label"
  - Clicking "Black Sabbath" should trigger UI search for artist Black Sabbath
  - Clicking album/recording/label should search for that entity type

This requires:

1. Integrate search store with result card components
2. Make entity names clickable in FloatingPlayer/NowPlaying displays
3. Trigger appropriate entity-specific searches when clicked

## API Examples

### Search for Artists

```typescript
const artists = await searchArtists("Led Zeppelin");
// Returns: MusicBrainzArtist[]
// UI shows: "🎤 Found 3 Artists"
```

### Search for Releases (Albums)

```typescript
const albums = await searchReleases("Paranoid", "Black Sabbath");
// Returns: MusicBrainzRelease[]
// UI shows: "💿 Found 5 Albums"
```

### Search for Recordings (Songs/Tracks)

```typescript
const tracks = await searchRecordings("Stairway to Heaven");
// Returns: MusicBrainzRecording[]
// UI shows: "🎵 Found 8 Songs"
```

### Legacy Combined Search (Backward Compatible)

```typescript
const results = await searchMusicBrainz({ query: "Beatles" });
// Returns: (MusicBrainzArtist | MusicBrainzRelease | MusicBrainzRecording)[]
```

## Album Artwork Support

Albums (releases) now display cover art from the **Cover Art Archive** ([coverartarchive.org](https://coverartarchive.org/)), which is MusicBrainz's official cover art repository.

### Implementation

- Uses the release MBID to fetch cover art: `https://coverartarchive.org/release/{mbid}/front-250`
- 250px thumbnails for performance
- Graceful fallbacks with loading states
- If no cover art is available, shows a disc icon placeholder
- Works in both `ReleaseResultCard` and `MusicBrainzSearch` components

### Visual Improvements

- 📀 **64x64px** thumbnails in dropdown results (`ReleaseResultCard`)
- 📀 **80x80px** thumbnails in full search page (`MusicBrainzSearch`)
- Smooth loading animation with pulsing disc icon
- Rounded corners and proper aspect ratio handling

## Conclusion

The refactoring successfully achieves the goal of creating reusable, focused ContextVM tools that better reflect the MusicBrainz API while maintaining full backward compatibility with existing code. The client-side composition approach provides flexibility and aligns with modern API design principles. Album artwork integration provides a visually rich user experience.
