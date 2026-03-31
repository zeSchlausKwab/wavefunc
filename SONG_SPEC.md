# WaveFunc Song Metadata & Favorites Spec

## Overview

WaveFunc plays internet radio. Streams carry ICY/metadata about what's currently playing.
We want to let users **favourite songs** they hear, build that into a community music catalog
on Nostr, and reuse those favorites as playlists — all with minimal data duplication.

---

## NIP Research Summary

> As of 2026-03-31 there is **no merged music NIP**. All music-specific event kinds live in
> open PRs. The ecosystem has converged on a de-facto standard (Wavlake's kind 31337) but
> nothing is ratified. We adopt the emerging consensus and will migrate if/when NIPs merge.

### Relevant merged NIPs

| NIP | Kind | Relevance |
|-----|------|-----------|
| NIP-51 | 30004 | Curation sets → used for albums and playlists |
| NIP-73 | — | `i` tag format for external IDs (ISRC, MBID) |
| NIP-78 | 30078 | App-specific data → already used for station favorites |
| NIP-92 | — | `imeta` tag for audio file metadata |
| NIP-32 | 1985 | Labeling → genre taxonomy |
| NIP-38 | 30315 | "Now playing" user status (`d=music`) |

### Relevant open PRs (draft proposals)

| PR | Kind(s) | Proposal |
|----|---------|----------|
| #1043 | 31337, 30037 | Audio events: track (31337) + music playlist (30037) |
| #1981 | 1073 | Scrobbling / "now played" events with ISRC |
| #2149 | 3088–3090 | Bitcoin-native music distribution (paid/IPFS) |
| #2211 | 30074–30075 | Podcasts (good architectural model) |

### Decision

- **Kind 31337** for individual song/track events (PR #1043 / Wavlake, widely used in the wild)
- **Kind 30004** (NIP-51 curation set) for albums and playlists — it's merged and works today
- **Kind 30078** for user song-favorites lists — consistent with existing WaveFunc station-favorites pattern
- No dedicated artist event kind: use Nostr `kind 0` profiles for artists on Nostr; embed name in tags for everyone else
- **NIP-38 kind 30315** `d=music` for broadcasting "now playing" status (separate, future feature)

---

## Data Model

We intentionally **discard** MusicBrainz complexity: no recordings vs. releases distinction,
no remasters, vinyls, box sets, or label hierarchies. We care about three things:

```
Artist  →  Album  →  Song
```

### Guiding principles

1. **Songs are the atoms.** A user favouriting a song publishes only a kind 31337 event.
   They reference the artist by name (and optionally a Nostr pubkey) and the album by name.
   They do NOT republish the full hierarchy.

2. **Albums are optional aggregates.** Any user (or the original artist) can publish a kind
   30004 curation set that groups songs. If an album event already exists on relays, others
   can reference it; they don't create a duplicate.

3. **No republication.** When user B wants to add a new song to an existing album, they
   publish a song event (kind 31337) that references the album by name/`a` tag — they do
   not republish the album event. If they control the album event (same pubkey), they can
   update it.

4. **MusicBrainz as bootstrap only.** MBID and ISRC are stored as external IDs in `i` tags
   for deduplication and lookup. We do not replicate MusicBrainz's relational model.

5. **Favorites are playlists.** A user's song favorites list is also a playlist. Users can
   have multiple named lists.

---

## Nostr Event Specifications

### 1. Song / Track — Kind 31337

Addressable (parameterized replaceable). One event per unique song.

```json
{
  "kind": 31337,
  "content": "",
  "tags": [
    ["d", "mb-<recording-mbid>"],
    ["title", "Song Title"],
    ["c", "Artist Name", "artist"],
    ["c", "Album Title", "album"],
    ["image", "https://coverartarchive.org/release/<release-mbid>/front-500"],
    ["thumb", "https://coverartarchive.org/release/<release-mbid>/front-250"],
    ["i", "mbid:<recording-mbid>"],
    ["i", "isrc:<isrc>"],
    ["duration", "<seconds>"],
    ["published_at", "<release-year-as-unix-timestamp>"],
    ["t", "<genre>"],
    ["r", "<youtube-url-or-audio-url>"]
  ]
}
```

**`d` tag — stable unique ID** (priority order):
1. `mb-<recording-mbid>` — MusicBrainz recording ID (preferred, globally stable)
2. `isrc-<isrc>` — ISRC code (if no MBID available)
3. `<artist-slug>-<title-slug>` — slugified fallback (least preferred)

**Required tags**: `d`, `title`, at least one `["c", "...", "artist"]`

**Optional tags**:
- `["c", "Album Title", "album"]` — album name
- `["image", "<url>"]` — full-resolution album art (500px from Cover Art Archive)
- `["thumb", "<url>"]` — album art thumbnail (250px from Cover Art Archive)
- `["published_at", "<timestamp>"]` — release year as Unix timestamp (Jan 1 of that year)
- `["i", "mbid:<recording-id>"]` — MusicBrainz **recording** ID
- `["i", "release-mbid:<release-id>"]` — MusicBrainz **release** ID (needed for cover art lookup)
- `["i", "isrc:<code>"]` — ISRC code
- `["i", "youtube:<video-id>"]` — YouTube video ID
- `["r", "<url>"]` — link to audio/video source
- `["duration", "<seconds>"]` — track duration
- `["t", "<genre>"]` — genre hashtag (can repeat)
- `["p", "<pubkey>", "<relay>", "Artist Name"]` — if artist has Nostr identity
- `["a", "30004:<pubkey>:<album-d>", "<relay>"]` — if a kind 30004 album event exists

**Cover Art Archive**: MusicBrainz hosts album art at `coverartarchive.org`. The URL is
constructed from the **release** MBID (not the recording MBID). Sizes: `front-250` (250px
thumbnail), `front-500` (500px), `front` (full size, may be very large). No auth required.

**`published_at` convention for music**: Unlike Nostr content events where this means "when
published to Nostr", for kind 31337 this tag represents the **original release year** of the
song, encoded as a Unix timestamp of Jan 1 00:00:00 UTC of that year. This is the same
convention used by NIP-71 video events for the video's original publication date.

Year extraction: `releaseDate` from MusicBrainz is a string like `"2005"`, `"2005-03"`, or
`"2005-03-14"`. Parse the year component and use `Date.UTC(year, 0, 1) / 1000`.

**Deduplication**: Before publishing, clients SHOULD check relays for an existing
kind 31337 event with the same `["i", "mbid:..."]` or `["i", "isrc:..."]` value.
If found, use the existing event's `a` address instead of publishing a duplicate.

---

### 2. Album — Kind 30004 (NIP-51 Curation Set)

Optional. Published by the artist or any curator. References songs via `a` tags.

```json
{
  "kind": 30004,
  "content": "",
  "tags": [
    ["d", "mb-<release-mbid>"],
    ["title", "Album Title"],
    ["image", "https://coverartarchive.org/release/<release-mbid>/front-500"],
    ["thumb", "https://coverartarchive.org/release/<release-mbid>/front-250"],
    ["description", "Album description"],
    ["published_at", "<release-year-as-unix-timestamp>"],
    ["i", "mbid:<release-mbid>"],
    ["c", "Artist Name", "artist"],
    ["p", "<artist-pubkey>", "", "Artist Name"],
    ["t", "<genre>"],
    ["a", "31337:<pubkey>:<song-d>", "<relay>"],
    ["a", "31337:<pubkey>:<song-d>", "<relay>"]
  ]
}
```

**Note**: Kind 30004 is already used by WaveFunc for other curation. To distinguish music
albums from other sets, we use the `["i", "mbid:..."]` tag and the `mb-` d-tag prefix.
A NIP-32 label `["l", "album", "wavefunc"]` can optionally mark it as an album.

---

### 3. User Song Favorites / Playlist — Kind 30078

Follows the existing WaveFunc station-favorites pattern. Uses app-specific data (NIP-78)
to keep it WaveFunc-scoped while remaining open/inspectable on Nostr.

```json
{
  "kind": 30078,
  "content": "",
  "tags": [
    ["d", "<list-id>"],
    ["l", "wavefunc_user_song_list"],
    ["name", "List Name"],
    ["description", "Optional description"],
    ["a", "31337:<pubkey>:<song-d>", "<relay>"],
    ["a", "31337:<pubkey>:<song-d>", "<relay>"]
  ]
}
```

**Multiple lists**: Users can have multiple song lists, each with a unique `d` tag.
A default list named `"Liked Songs"` is created automatically on first favourite.

**As playlist**: Lists are ordered by insertion time (tag order). Clients can play through
all referenced songs in order if audio URLs are available.

**Discovery**: Query: `{ kinds: [30078], authors: [pubkey], "#l": ["wavefunc_user_song_list"] }`

---

## MusicBrainz Integration Strategy

The contextvm already provides MusicBrainz data. The player store already captures it in
`currentMetadata.musicBrainz`. When a user favourites a song:

### Schema gap: `releaseId` is missing

The current `MusicBrainzRecording` schema captures `release` (title string) and `releaseDate`
but **not** `releaseId` (the release MBID). The raw MB API response includes
`rec.releases?.[0]?.id` but the mapping in `contextvm/tools/musicbrainz.ts` drops it.

**Required change**: Add `releaseId?: string` to `MusicBrainzRecording` (in both
`contextvm/schemas.ts` and `src/types/musicbrainz.ts`) and capture it in the mapping.
This unblocks cover art and the `["i", "release-mbid:<id>"]` tag.

### What we use from MusicBrainz

| MB Field | Maps to | Note |
|----------|---------|------|
| `id` (recording MBID) | `["d", "mb-<id>"]`, `["i", "mbid:<id>"]` | Primary key |
| `title` | `["title", "..."]` | Song title |
| `artist` | `["c", "...", "artist"]` | Primary artist name |
| `artistId` | (internal only) | For potential kind 0 profile linking |
| `release` | `["c", "...", "album"]` | Album name string |
| `releaseId` ⚠️ *missing* | `["i", "release-mbid:<id>"]`, cover art URL | **Must add to schema** |
| `releaseDate` | `["published_at", "<year-timestamp>"]` | Parse year, Jan 1 UTC timestamp |
| `duration` | `["duration", "..."]` | Convert ms → seconds |
| `tags[]` | `["t", "..."]` | Genre hashtags |
| ISRC (if present) | `["i", "isrc:<code>"]` | From MB recording details call |

**Cover art URL construction** (once `releaseId` is available):
```ts
const thumb = `https://coverartarchive.org/release/${releaseId}/front-250`;
const image = `https://coverartarchive.org/release/${releaseId}/front-500`;
```

**Year extraction**:
```ts
const year = parseInt(releaseDate.split("-")[0], 10);
const published_at = Math.floor(Date.UTC(year, 0, 1) / 1000);
```

### What we deliberately IGNORE

- Release groups, remasters, vinyl editions, promo versions → irrelevant
- Label, barcode, catalog number → irrelevant
- Multiple artist credits → use `artist-credit[0].name` (primary credit only)
- `trackCount`, `status`, `barcode` from release → irrelevant

### Lookup flow

1. Stream metadata arrives → `currentMetadata.song` + `currentMetadata.artist`
2. Player store triggers `SearchRecordings(song, artist)` → gets MB recording with MBID
3. On favourite click:
   a. If `currentMetadata.musicBrainz` is populated → proceed
   b. If not → trigger search, wait for result, then proceed
   c. If search fails → fall back to raw `song`/`artist` strings, use slug `d` tag

---

## User Interface Changes

### FloatingPlayer — Mobile (small screen)

In the "now playing" bar, add a star button **inline with the song title row**.

Current layout:
```
[station name / metadata]     [play/pause] [stop] [logo]
```

Target layout (when song metadata is available):
```
[station name / metadata ★]   [play/pause] [stop] [logo]
```

The `★` (star icon) appears only when `currentMetadata.song` is present.
- Unfilled star: not in any song list
- Filled star (primary color): in at least one song list

### FloatingPlayer — Desktop footer

In the station info section (left side), below the song title:

Current:
```
"Song Title · Artist"  (clickable → MusicBrainz search)
```

Target:
```
"Song Title · Artist"  ★   (star added at end)
```

### Favourite Song Flow

1. User clicks ★
2. If user is not logged in: show login prompt
3. If song already in "Liked Songs": show confirmation/remove option
4. If only one list exists: directly add to "Liked Songs" (with brief toast)
5. If multiple lists exist: show dropdown (same pattern as `FavoritesDropdown` for stations)
6. On confirm:
   a. Check relays for existing kind 31337 with same MBID/ISRC
   b. If exists: use that `a` address
   c. If not: publish new kind 31337 event
   d. Update user's song list (kind 30078): add `a` tag, publish

---

## Implementation Plan

### Phase 1 — Data layer

**Schema changes first** (`contextvm/schemas.ts` + `src/types/musicbrainz.ts`):
- Add `releaseId?: string` to `MusicBrainzRecording`
- Capture `rec.releases?.[0]?.id` in the mapping functions in `contextvm/tools/musicbrainz.ts`

**NDKSong class** (`src/lib/NDKSong.ts`)
- Wraps kind 31337 events
- Fields: `songId` (d-tag), `title`, `artist`, `album`, `mbid`, `releaseId`, `isrc`, `duration`, `releaseYear`, `coverArt`, `thumb`, `genres`, `sourceUrl`
- Static `fromMetadata(metadata: CurrentMetadata): NDKSong` — build from player metadata, derive cover art URLs from `releaseId`, extract year from `releaseDate`
- `publish(ndk): Promise<void>` — check for existing by MBID/ISRC, publish if new
- `address: string` — `31337:<pubkey>:<d>`

**NDKWFSongList class** (`src/lib/NDKWFSongList.ts`)
- Follows `NDKWFFavorites` pattern but for songs (kind 30078, `l` tag `wavefunc_user_song_list`)
- `addSong(address, relay?)`, `removeSong(address)`, `toggleSong(address, relay?)`
- `getSongs(): string[]` — list of `a` addresses
- `hasSong(address): boolean`
- `addSongAndPublish(ndk, address, relay?)`, `toggleSongAndPublish(ndk, address, relay?)`

**useSongFavorites hook** (`src/lib/hooks/useSongFavorites.ts`)
- Mirrors `useFavorites` hook for stations
- Returns: `songLists`, `defaultList`, `addToList`, `removeFromList`, `isInAnyList`, `createList`

### Phase 2 — UI

**SongFavoriteButton component** (`src/components/SongFavoriteButton.tsx`)
- Props: `metadata: CurrentMetadata`, `size?: "sm" | "md"`
- Handles: lookup, publish song event, add to list
- States: idle, loading, favourited
- Multi-list: renders `FavoritesDropdown`-style popover if user has multiple lists

**FloatingPlayer changes** (`src/components/FloatingPlayer.tsx`)
- Import and render `<SongFavoriteButton>` next to song metadata in both mobile and desktop views
- Conditionally shown: only when `currentMetadata?.song` is truthy

### Phase 3 — Song browsing (future)

- `/songs` route listing community-published kind 31337 events
- Song detail view with community comments (kind 1111 via `a` tag)
- Album view (kind 30004) listing tracks

---

## Open Questions

1. **Who "owns" a song event?** Any user can publish a kind 31337 for a song. Multiple users
   may publish duplicates. We detect duplicates via ISRC/MBID `i` tags.
   → *The WaveFunc relay already accepts and indexes kind 31337 events (relay/main.go).
   Search indexes: title + artist + album + genre tags. Deduplication by `i` tag is a
   client-side responsibility for now — relay-side dedup is a future concern.*

2. **What if the user has no MusicBrainz result?** Raw stream metadata (song/artist strings)
   may be inaccurate or partial. Should we allow saving without MBID?
   → *Proposed: yes, use slug `d` tag. Mark event with `["L", "wavefunc"]` `["l", "unverified"]`*

3. **Album model: 30004 vs. future 30037?** Kind 30004 is generic (articles, stations, etc.).
   Kind 30037 is the proposed music-specific playlist. We use 30004 for now and add a
   migration path when 30037 merges.
   → *Track PR #1043 — migrate when merged*

4. **Audio/video source URLs.** MusicBrainz doesn't provide audio URLs. For "eventual link to
   remote song file or youtube": should WaveFunc fetch a YouTube link automatically (via
   search), or wait for a user to add it manually?
   → *Proposed: manual for now. Add `["r", "<url>"]` via an edit UI later*

5. **NIP-38 now-playing.** Should WaveFunc publish `kind 30315 d=music` when a user is
   listening? This is a separate, lower-priority social feature.
   → *Out of scope for this phase*

6. **Relay support for kind 31337.** The WaveFunc Go relay needs to accept and index
   kind 31337 events (if it doesn't already via generic parameterized-replaceable handling).
   → *Verify relay kind filter config before shipping*
