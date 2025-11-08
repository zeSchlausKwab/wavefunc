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

- [ ] Consolidate ContextVMs and improve metadata service
  - Consolidate our contextvms in general for better organization
  - Enhance metadata service to allow searching for all entity types (artists, recordings, releases, labels, etc.)
  - Better reflect the original MusicBrainz API structure and capabilities
  - New ContextVM approach pushes the composition of searches to the client
  - Add convenience clicking in "now playing" results to search for entities
    - Example: "Paranoid - Black Sabbath - Paranoid (1968), British label"
    - Clicking "Black Sabbath" should trigger UI search for artist Black Sabbath
    - Clicking album/recording/label should search for that entity type

## Backlog

<!-- Add future tasks here -->

## Completed

<!-- Move completed tasks here -->

---

**Last Updated:** 2025-11-08
