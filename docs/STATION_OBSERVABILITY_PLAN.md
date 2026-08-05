# Station observability and discovery plan

**Status:** Implemented
**Branch:** `feature/health`
**Scope:** Nostr-native station monitoring and discovery without Radio Browser imports

## Objective

Make WaveFunc's existing, WaveFunc-signed kind `31237` station events the canonical catalog, continuously measure station quality and listening activity, publish portable signed summaries to Nostr, and turn those summaries into useful discovery surfaces in the app.

The operational database is a rebuildable index and history store. It is not the catalog and must never become the only source of a public fact.

## Architecture and trust boundaries

| Responsibility | Source of truth | Signing identity |
|---|---|---|
| Station identity and editable station data | Addressable kind `31237` events | WaveFunc catalog key (`APP_PRIVATE_KEY`) |
| Stream health and current track | Addressable observation events | Observer/ContextVM key (`METADATA_SERVER_KEY`) |
| Rankings and compact discovery lists | Addressable aggregate events | Observer/aggregator key |
| Human reports and confirmations | NIP-32 kind `1985` labels targeting a station `a` address | Reporting user |
| Scheduling, probe history, listening sessions, and track history | Local SQLite database | Not public by itself |

Production observers read the WaveFunc app relay for the catalog and reports. Development observers use only the local app relay for app data. Client identity, wallet, and zap reads keep their existing role-specific public-relay policy; no development fixtures are published to public relays.

## Public event contracts

- `31238` — station health summary. Stable `d` is the station address; tags include `a`, status, score, checked time, and optional expiry.
- `31239` — current track observation. Stable `d` is the station address; tags include `a`, artist/title when known, and a short NIP-40 expiration.
- `31240` — ranking snapshot. Stable `d` identifies metric/window, such as `most-liked:7d`, `most-zapped:7d`, or `most-listened:24h`.
- `1985` — user report/confirmation labels. Supported labels: `down`, `up`, `ads`, `adfree`, `http-insecure`, `metadata-wrong`, and `duplicate`.

All parsers reject malformed content and preserve the referenced kind `31237` address. Current-track events are published only when the semantic track changes or the prior observation needs a TTL refresh; the 15-second client heartbeat is not mirrored into Nostr.

## Data collection

1. On first start, materialize the complete WaveFunc-signed station catalog from Nostr into SQLite. Later starts request only catalog updates since the last sync and maintain a live subscription.
2. Distribute `next_check_at` across a 24-hour window. A minute loop claims a bounded batch with limited concurrency so every registered station is checked at least daily without a thundering herd.
3. Record status, latency, resolved URL, content type, and insecure HTTP state. A permanent redirect is only a catalog-update candidate; catalog mutation requires repeated confirmation and an explicitly enabled catalog updater.
4. Treat ContextVM metadata calls as anonymous session heartbeats. A session uses an ephemeral random ID, station address, and timestamps—never an account pubkey. Derive listener-minutes and active listeners from sessions rather than counting requests as listens.
5. Store track segments in SQLite. Publish the current track to Nostr on change/refresh and derive aggregate track rankings from segments instead of publishing every poll.
6. Ingest WaveFunc-targeted reactions, zap receipts, and NIP-32 reports from the app relay incrementally. Deduplicate likes per author and all events by event ID.

## Quality score

The first score is intentionally explainable:

- A successful scheduled probe establishes an `up` baseline.
- Failed probes reduce the score with consecutive-failure pressure; repeated failures produce `down`.
- Plain HTTP is surfaced as `http-insecure` and carries a modest penalty, but remains playable by native apps.
- Recent unique community confirmations adjust the score within a capped range. They cannot overpower the automated probe or directly rewrite the catalog.
- Ads/ad-free and metadata-quality labels remain visible evidence and may affect ordering, but do not make an otherwise unreachable stream healthy.

## UI contract

The landing page keeps `FEATURED_COLLECTIONS` first and adds a compact `SIGNAL_CHARTS` block before genre rows:

- `BEST_SIGNAL` — latest verified station-health score.
- `HAS_NOW_PLAYING` — stations with successful track metadata during the last 24 hours.
- `MOST_LISTENED` — listener-minutes over 24 hours.
- `MOST_LIKED` — unique reaction authors over 7 days.
- `MOST_ZAPPED` — unique zap receipts over 7 days.
- `ON_AIR_NOW` — fresh current-track observations, when available.
- `RECENT_DOWNLOADS` — the latest signed song records that point to a user-persisted Blossom file.

Desktop uses a two-column chart grid. Mobile uses one horizontal, snap-scrolling rail per chart so the feature does not turn the landing page into a long stack. Each item remains a real station action surface: rank, artwork/name, metric, and play button.

Station cards display the aggregate quality score directly (`QUALITY_0`–`QUALITY_100`) together with its state (`UP`, `DEGRADED`, `DOWN`, or `INSECURE`). The persistent player uses the compact `Q_92` form and shows `Q_—` while a selected station awaits its first check. Missing evidence is never presented as a bad score. The station detail view exposes a report/confirm control for authenticated users.

Recent downloads sit in the same two-column grid as observer rankings and reuse signed kind `31337` song records containing both a Blossom file URL and their original YouTube identifier. This lets users replay or save a recently persisted file without making local browser history a source of truth.

Favorites list cards have a fixed internal station viewport with touch momentum, overscroll containment, and a visible slim scrollbar. The page itself should not grow indefinitely with a long list.

## Delivery tasks

### 1. Event and scoring contracts

- Add builders/parsers for kinds `31238`–`31240` and NIP-32 station labels.
- Add deterministic health scoring and semantic track identity helpers.
- Verify malformed, expired, and incorrectly targeted observations are rejected.

### 2. Observer service

- Add the SQLite schema, incremental catalog/report/social synchronization, daily scheduler, bounded stream probe, listening heartbeat recording, track segments, and aggregate snapshot publication.
- Extend `extract_stream_metadata` with optional station/session context while keeping old clients compatible.
- Keep observer and catalog keys separate; make automatic catalog redirect updates opt-in and repetition-gated.

### 3. Client discovery data

- Add cached Applesauce timeline hooks for signed health, current-track, and ranking events.
- Resolve ranking addresses through the existing parameterized station loader.
- Ensure no new per-card relay subscriptions are introduced.

### 4. Landing and station UI

- Add responsive signal charts for best signal, now-playing capability, most listened, liked, zapped, and currently playing.
- Add station health presentation and authenticated NIP-32 reporting.
- Make favorites station viewports reliably scrollable on web, Android, and desktop.

### 5. Verification and rollout

- Unit-test event contracts, score calculation, database aggregation, stage isolation, and UI source contracts.
- Run the full Bun test suite and production build.
- Visually check 360–541 px mobile widths and desktop layout.
- Deploy with a persistent `OBSERVER_DB_PATH`, the observer key, and the existing catalog key. Let the observer build history before using quality as a hard filter.

## Acceptance criteria

- The scheduler can rebuild its registry from kind `31237` events signed by the configured catalog pubkey and does not import Radio Browser data.
- Every stored station gets a due time within 24 hours, and checks are bounded by configured batch/concurrency limits.
- Metadata polling sends an anonymous session heartbeat; repeated 15-second requests do not inflate listen starts.
- A changed current track produces one replaceable expiring event; an unchanged track does not publish on every heartbeat.
- Landing charts render from signed kind `31240` snapshots and disappear cleanly when no snapshot exists—no permanent skeletons.
- Most-liked counts unique reacting pubkeys. Most-zapped counts unique receipt events. Most-listened uses listener-minutes.
- Development app data stays local; production refuses localhost app relays.
- Favorites list internals scroll independently with touch momentum.
- Tests and production build pass.

## Deliberate rollout constraints

- Quality starts as advisory. Do not hide stations solely because the observer has little history.
- Automatic permanent-redirect catalog updates require `STATION_AUTO_UPDATE=true`, the catalog key, and repeated confirmation.
- New station discovery is community/WaveFunc submission work, not an external directory import. This phase establishes the health and evidence pipeline those submissions will use.
