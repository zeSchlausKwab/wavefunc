# Wavefunc Development Agenda

## Current Tasks

- [ ] Create a clean way to have featured lists of stations presented on the root page

  - Should fit with the current UI of having stations listed at the beginning
  - Consider multiple featured categories (trending, new, editor's picks, etc.)

- [ ] Build a ContextVM tool for station migration with NIP-05 verification

  - Check if pubkeys can verify ownership of websites listed in existing radio stations
  - User republishes the station with verified credentials
  - ContextVM automatically deletes the seeded station on behalf of wavefunc
  - Enables transition from wavefunc-seeded stations to user-owned stations

- [x] Consolidate ContextVMs and improve metadata service
  - [x] Split MusicBrainz searches into separate, reusable tool calls (search_artists, search_releases, search_recordings, search_labels)
  - [x] Each tool represents a method that can be reused independently (like stream_metadata)
  - [x] Better reflects the original MusicBrainz API structure
  - [x] New ContextVM approach pushes the composition of searches to the client
  - [x] UI updated with entity type selector allowing users to choose what to search
  - [x] Support for searching labels (record labels)
  - [ ] Add convenience clicking in "now playing" results to search for entities
    - Example: "Paranoid - Black Sabbath - Paranoid (1968), British label"
    - Clicking "Black Sabbath" should trigger UI search for artist Black Sabbath
    - Clicking album/recording/label should search for that entity type

## Backlog

<!-- Add future tasks here -->

## Completed

<!-- Move completed tasks here -->

---

**Last Updated:** 2025-11-08
