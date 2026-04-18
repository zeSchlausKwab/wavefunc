# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.2] - 2026-04-18

### Fixed
- Relay's bleve search index could silently drift from LMDB and return zero
  kind-31237 matches for terms like "soma", "drone zone", "flux fm", or
  "guerrilla" even though the stations were stored. The fix:
  - `QueryEvents` now pushes `filter.Kinds`, `Authors`, `Since` and `Until`
    down into the bleve query (was: search returned any matching kind and
    station hits got pushed out of the 100-slot result by non-station noise).
  - `ReplaceEvent` now sweeps zombie bleve entries for the same
    `{kind, pubkey, d}` coordinate after every replaceable-event update
    (was: bleve accumulated dead IDs that LMDB could no longer resolve).
  - `--reindex` rebuilds per-kind (kind index) in 500-doc batches with a
    per-doc fallback and an explicit `Close()`. The prior empty-filter
    iteration walked the createdAt index and slowed to a crawl once many
    events shared the same second; larger batches also triggered
    `invalid address` errors mid-scorch-flush on the ~50k-event corpus.
  - Stale bleve hits whose LMDB lookup returns nothing are now deleted
    opportunistically at query time so they don't waste result slots.
  - Startup logs a loud drift warning if LMDB has kind-31237 events but
    bleve is essentially empty.
- Frontend station search was entirely client-side: it pulled the 500
  most-recent kind-31237 events and grepped them, which meant any term not
  in the recent 500 returned "NO_SIGNAL_FOUND". `useStationsObserver` now
  forwards `searchQuery` as a NIP-50 `search` filter to the relay, and
  `matchesStationSearch` tokenizes like bleve (split on non-word chars,
  match whole-token or prefix) so it doesn't drop hits the server approves
  (e.g. "FLUX FM" vs "FLUX FM-KlubRadio").

### Changed
- Search indexing includes kind-31237 genre tag values alongside name and
  description, so a query like "ambient" matches stations whose text
  content doesn't mention the word directly.
- `scripts/deploy-remote.sh` detects bleve/LMDB drift on deploy and
  auto-runs `./scripts/reindex-search.sh` in the background.

## [0.1.0] - 2025-12-22

### Added
- Nostr-based internet radio directory and player
- Full-text search via Go relay with SQLite and Bluge
- Desktop app via Tauri (macOS, Windows, Linux)
- Android app via Tauri mobile
- System tray, media keys, autostart, deep linking (desktop)
- Sleep timer and share functionality
- Cashu wallet integration (NIP-60)
- Favorites lists with image support
- Station zapping via applesauce-native
- ContextVM metadata server for stream information
- HLS streaming support via hls.js
- Admin panel with curated reference lists
- Legacy database migration tooling
- VPS deployment automation with GitHub Actions
