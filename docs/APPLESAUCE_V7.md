# Applesauce v7 migration

Implemented October 21, 2026, following the [v7 release announcement](https://nostr.at/naddr1qvzqqqr4gupzqfngzhsvjggdlgeycm96x4emzjlwf8dyyzdfg4hefp89zpkdgz99qqxkzursd3jhxct4vdjj6a3hvhmxzc).

## Dependencies and compatibility

The application's Applesauce packages resolve to 7.0.0, including the newly adopted `applesauce-wallet-connect`. RxJS is now a direct dependency. Cashu TS resolves to 4.12.0 to match Applesauce Wallet's amount types. Bun 1.3.11 and TypeScript 5.9.3 are pinned; CI installs the lockfile and runs type checking, tests, and the production build.

`@contextvm/sdk` remains at 0.8.0 with its own nested Applesauce dependency tree. Do not override its internal major versions to v7. Updating ContextVM is a separate transport/protocol migration; its latest release inspected during this work still used Applesauce v6. The server's structured-result typing was corrected without changing the wire payload.

## Runtime boundaries

| Module | Responsibility |
| --- | --- |
| `src/lib/nostr/store.ts` | Application-lifetime EventStore, RelayPool, RelayLiveness, account manager, action runner, publication, and wallet operation couch. Instances survive hot reload. |
| `src/lib/nostr/eventLoading.ts` | Attaches unified loaders before React models subscribe. Reads current relay policy for each batch; routes identity, wallet metadata, contacts, and app data separately. |
| `src/lib/nostr/transport.ts` | Captured-signer AUTH policy and accepted-publication checks. A scoped pool view shares sockets while keeping wallet authentication attached to its owning account. |
| `src/lib/nostr/runtime.tsx` | React context and account/mailbox integration. |
| `src/lib/nostr/useActiveWallet.ts` | One wallet session per account/signer, startup failure state, cleanup, and retry. |
| `src/lib/nostr/wallet.ts` | NutWallet adapter for relay-confirmed local state, mutation exclusion, NIP-61 sends, and deposit cancellation. |
| `src/lib/nostr/walletCouch.ts` | Commit-aware wallet backup using the existing IndexedDB schema, with resumable legacy migration. |
| `src/lib/nostr/queryRegistry.ts` | Shared query lifecycle, cached results, live updates, and visible relay errors. |
| `src/lib/nostr/eventCache.ts` | Batched IndexedDB wire-event persistence and bounded retention. |

Public reads explicitly avoid interactive AUTH. Account-bound writes and wallet operations capture their signer instead of consulting a mutable active-account proxy during an authentication challenge. Publishing succeeds only when at least one relay accepts the event; an all-rejected result is an error, including in the wallet's pool view. Only actual accepting/receiving relays are recorded as provenance.

The EventStore insertion/removal boundary owns event persistence. Query callers do not write the same event again or invent provenance. Pending writes and deletes are ordered; retention is capped at 20,000 events with a 30-day TTL, pruned on writes at most once per minute. The wallet operation couch is separate and is not pruned.

App and wallet action runners disable v7's optimistic `saveToStore` behavior. A locally inserted but rejected recovery event can otherwise make the next recovery believe its proofs are already stored, causing it to clear the backup. Publication inserts only after an accepted verdict. Repeated rejection retains the backup and the last accepted wallet configuration.

The wallet couch retains the `wavefunc-cashu` database, version 1, `operation-couch` store, and SDK record format. It acknowledges a write on transaction completion, retains full Cashu v2 keyset IDs, retries failed database opens, and refuses to silently filter corrupt records during recovery. Legacy migration removes each source token only after its destination write commits and skips already-committed copies on retry.

## Features

### Relay settings

- Real pool connection status and liveness/backoff state, with explicit retry and on-demand NIP-11 information.
- Account-specific local read/write preferences, URL validation, duplicate normalization, and a 12-relay cap.
- Separate local Save and public NIP-65 Publish actions. Publishing retains other mailbox metadata and advertises the edited inbox/outbox list through old/new outboxes and identity relays.
- Production general/social reads and ordinary fallback writes use personal preferences. App station data, identity discovery, wallet relays, and development isolation retain their role policies.

### Comments, reactions, and community

- Station comments use NIP-22 root and parent tags; readers retain legacy lowercase address-tagged comments. Thread construction deduplicates events and handles missing parents and malformed cycles without losing every orphan.
- Community replies use kind 1/NIP-10. Existing kind 1111 community replies remain readable, including their ancestry when loaded.
- Comment badges use the v7 CountService where available. Counts are attributed to one responding relay, preserve approximate/fresh metadata, and are never summed across relays. Unsupported/failed COUNT falls back to batched event reads; unavailable data displays `?` rather than a false zero. The author's own-comment indicator remains a filtered event query.
- Reactions retain distinct-author semantics; they are not replaced with raw event counts. Zap receipts also retain their event-based aggregation.
- Station cards start social queries near the viewport. Query subscriptions release shortly after their last observer leaves while cached events remain available.
- Community history starts with a finite seven-day window, expands through Load older posts, and has an independent live subscription. Partial history failures remain visible with a retry action.

### Wallet and signing

- NWC uses `applesauce-wallet-connect` for URI interpretation, encryption negotiation, requests, and response validation. The adapter validates WebSocket relays and keys, rejects failed publication, bounds payment waits, and releases transport subscriptions. It does not automatically retry a payment.
- Lightning deposits use `wallet.deposit` with an abort signal allocated before quote creation. Closing/resetting during quote creation prevents a late quote from starting a payment waiter; later cancellation aborts the waiter.
- Wallet mutations reject overlapping operations at the wallet boundary, before UI busy state renders. Quote reads, unlocking, and relay backups can still overlap. NIP-61 sends now belong to this same wallet instance and signer, rather than UI-owned action orchestration.
- NIP-61 sends commit a combined backup of the swapped outgoing proofs and change before publishing. The backup survives publication failure; the SDK action's unconditional couch cleanup is bypassed. Successful completion clears it only after the outgoing event and spend bookkeeping are accepted.
- Startup/operation errors are visible; reconnect and existing recovery controls remain accessible. Maintenance displays remaining local backup entries after incomplete recovery, and mutations are disabled while the wallet is busy.
- QR NIP-46 pairing uses `connectSecret`; bunker authorization remains a separate secret. Requests have a deadline, late QR completion cannot log in after cancellation, and logout closes the local signer transport.

## Validation

Run from the repository root:

```sh
bun install --frozen-lockfile
bun run typecheck
bun run test
bun run build
bun run benchmark:nostr
```

The automated suite covers NIP-22/NIP-10 interoperability, legacy/orphan/cyclic comments, relay preference persistence, cache ordering/provenance/retention, finite history windows, COUNT zero versus unavailable, EOSE versus CLOSED, partial relay success, rejected publication, captured-signer AUTH, liveness reset, NWC NIP-04/NIP-44 negotiation and failure cleanup, and NIP-46 secret/ack/timeout behavior. Wallet fault tests cover transaction abort after request success, retry after failed storage initialization, v1 schema compatibility, full v2 keyset IDs, corrupt-record preservation, partial migration, repeated rejected recovery, mutation overlap, rejected configuration changes, cancellation during quote creation, and accepted/rejected station nutzaps with mocked mint swaps. These tests use synthetic proofs, never real funds.

Local browser smoke checks use a disposable fixture identity and a read-only relay that rejects publication: recent community history, older-window expansion, mixed relay status, URL validation, and preference persistence after reload. No public events or payments are needed for this check.

The local unsigned macOS debug binary compiles successfully with locked offline Cargo dependencies:

```sh
bun run tauri build --debug --no-bundle --no-sign --ci -- --locked --offline
```

This checks native compilation and the embedded frontend build, not signed installer packaging. Release media resources (`yt-dlp` and Deno) are supplied by the existing release workflow. Real wallet settlement, extension/mobile/remote signer interaction, Windows/Android builds, and signed installer packaging still need platform testing before release.

### Performance sample

Same machine and Bun 1.3.11, median of five measured runs after warmup:

| Synthetic workload: 10,000 events, 100 observed targets | v6 | v7 |
| --- | ---: | ---: |
| EventStore ingestion/model routing | 150.19 ms | 55.69 ms |
| Warm filter reads | 32.35 ms | 3.23 ms |

Both versions returned 5,000 matches and 5,100 model emissions. The benchmark deliberately excludes signature verification and network/UI work; these numbers are not an end-to-end application speedup claim. `scripts/benchmark-nostr.ts` makes the workload reproducible.

## Follow-up work deliberately separate from this migration

- ContextVM SDK upgrade: verify the client/server protocol and its dependency boundaries together.
- Broad outbox feed discovery and NIP-66 relay selection: measure traffic, coverage, and connection limits before expanding relay fanout.
- NIP-38 listening status: opt-in product behavior and privacy controls are needed before publishing listening activity.
- Persistent decryption caching: define protected storage and logout behavior first. No plaintext decryption cache was added.
- Optimistic verification and a full cache/storage replacement: keep verified ingestion and the durable wallet couch; profile an actual bottleneck before replacing either.

## Development housekeeping

The combined web and desktop launchers now use owned process groups, check port availability, bound relay readiness, stop on service failure, and clean up on cancellation. Normal startup and shutdown preserve the database and index; `relay:reset` is explicit. `relay:kill` verifies both executable and checkout before stopping a listener and never deletes data. Disposable process tests cover descendants, unrelated services, failure, cancellation, and startup deadlines.

Station sharing was committed separately in `9004f3e` before this migration.
