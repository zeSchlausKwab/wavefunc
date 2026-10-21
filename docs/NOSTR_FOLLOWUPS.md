# Nostr follow-ups and app supporters

Implementation work begun October 21, 2026. Keep separate commits for independently reviewable changes. Preserve existing local configuration and unrelated notes.

## Authorized scope

- [x] Verified app-support leaderboard: all-time top five identified public senders, names/avatars/sats, beside featured collections in a desktop 2:1 split; stack on mobile.
- [x] Mark new support requests using NIP-32 self-labels inside signed NIP-57 requests. User-approved historical exception: verified direct-to-profile receipts dated before 2026-10-21 08:58:13 UTC seed the board. New unmarked profile zaps and historical post zaps need explicit confirmation by the receiving account, represented by signed NIP-32 labeling events. Never infer attribution from comments alone.
- [x] Android development launcher uses owned processes and explicit cancellation.
- [x] ContextVM SDK compatibility upgrade with client/server loopback protocol checks.
- [x] Bounded outbox discovery plus advisory NIP-66 relay information; keep role isolation and connection budgets.
- [x] Opt-in NIP-38 listening status with account ownership, expiration, pause/stop clearing, and visible controls.
- [x] Optional protected persistent decryption cache, explicit unlock/clear controls, account isolation, and lock/logout cleanup.
- [x] Integration checks, frontend/browser verification, documentation, and commits.

The earlier performance sample is synthetic. Optimistic verification and replacing all storage remain contingent on profiling evidence; verified ingestion and durable wallet backups must remain intact.

## Protocol references

- [NIP-57](https://github.com/nostr-protocol/nips/blob/master/57.md): validate provider signer, request, invoice amount, LNURL, and receipt binding; receipts attest to payment according to the LNURL provider.
- [NIP-32](https://github.com/nostr-protocol/nips/blob/master/32.md): self-labels and labels on existing events, using an unambiguous namespace.
- [NIP-38](https://github.com/nostr-protocol/nips/blob/master/38.md): expiring music status, empty content to clear.
- [NIP-66](https://github.com/nostr-protocol/nips/blob/master/66.md): monitor reports are advisory and cannot be required for relay connections.

Real payments, public status publication, authenticated device testing, and signed releases require the relevant user-controlled wallets/devices/credentials. Do not make payments or publish events merely to test implementation.

## Implementation details

### Supporters

`TopSupporters` sits beside featured collections with a 2:1 grid on desktop and stacks below it on mobile. It aggregates the five largest public sender totals, uses exact millisatoshi arithmetic, and shows profile names and avatars. Duplicate invoices count once. Only receipts signed by the recipient's current LNURL-advertised provider qualify; an unpaid request, a different provider, mismatched amounts/targets, invalid signatures, and anonymous senders cannot inflate the board. NIP-57 description hashes are checked when present; providers using legacy plain-description invoices remain compatible with the NIP's SHOULD-level guidance.

Future support requests contain NIP-32 `L`/`l` self-labels in `live.wavefunc.support`, alongside the ordinary NIP-57 tags. Historical direct profile receipts qualify only when both request and receipt precede the fixed historical cutoff. Post zaps and newer unmarked profile zaps need explicit receiving-account curation. The receiving account sees a review dialog that publishes signed kind-1985 include/exclude decisions; other accounts cannot curate. History pagination handles tied timestamps and surfaces partial results when relays fail or the work cap is reached. Current-provider validation can omit older receipts from a previous Lightning provider.

Read-only inspection found six qualifying old direct receipts from two identified senders; browser verification displayed those two supporters. The maximum is five, without padding the list with invented users.

Each supporter also shows their latest non-empty message from an included, verified zap request, including old wallet-authored messages. Blank later zaps do not erase an earlier message, and excluded receipts cannot supply one. Text is rendered plainly, preserving line breaks. The support dialog provides an optional 280-character message field with explicit public-credit guidance. Signed messages use NIP-57 request content; optional LUD-12 wallet comments are sent only within the advertised limit. Unsupported private comments produce an error before an invoice is requested.

### Optional discovery and status

Community outbox discovery is off by default and account-scoped on this device. It supplements the app feed for known participants, loads their NIP-65 lists before applying fallbacks, excludes insecure/private-address candidates and failing relays, and uses a separate pool that closes on cleanup. App data and wallet routing remain separate. NIP-66 suggestions require fresh signed reports from at least two distinct monitors, query only on demand, and edit the relay draft for explicit saving. Monitor keys are not proof of independent operators; reports remain advisory.

Listening status is also off by default. While enabled and playing, kind-30315 `d=music` events contain the track and station link. Updates are throttled to ten seconds and refreshed every two minutes, with a five-minute expiration. Stale signer results cannot publish after a newer selection, disable, or account change. Pause/stop/disable attempts an empty status. Closing the app or switching accounts relies on expiration rather than asking the old signer to publish. A failed clear can remain visible until expiration. No public listening status was published during verification.

### Protected cache

The new `wavefunc-wallet-decryption-cache-v1` IndexedDB database is separate from the operation couch. Each account's salt, encrypted check, and encrypted entries are isolated. PBKDF2-SHA-256 (600,000 iterations, random 16-byte salt) derives a non-extractable AES-256-GCM session key. Every entry uses a fresh 12-byte IV and account/event-bound authenticated data. No passphrase or derived key is persisted. Retention is capped at 30 days, 500 entries, and approximately 8 MB of ciphertext per account.

Enable/unlock, lock, and erase controls live in wallet settings, including while the wallet is locked. Existing caches defer automatic signer decryption until the user unlocks the cache or chooses normal wallet unlock. Cache failures fall back to signer decryption; durable recovery backups remain untouched. Wrong passphrases never overwrite existing caches. Lock/clear/account teardown invalidate pending cryptographic work and discard the session key. Stopping the wallet clears decrypted event content, including late unlock completions.

## Validation

- 158 Bun tests, TypeScript checking, and production frontend build pass. The earlier unsigned macOS debug Tauri build also passed.
- Added regression coverage for receipt forgery/attribution/deduplication/top-five/timestamp pagination, Android reverse-port ownership, encrypted and plaintext ContextVM tool calls/progress/errors, relay-selection limits and stale monitor reports, queued listening-status cancellation, and encrypted-cache isolation/tampering/lock races/real NutWallet cache reuse.
- Browser checks: desktop 2:1 width (approximately 779 px / 390 px at the tested viewport), mobile stacking with no horizontal overflow, real historical names/avatars/amounts, support-dialog navigation, default-off listening/outbox switches, and test-account logout. The wallet's remote relay was unavailable during UI inspection; wallet cache behavior was verified with isolated NutWallet integration tests.
- Release preflight: six temporary mixed-version checks pass for ContextVM 0.8.0 clients against 0.14.3 servers and the reverse, in disabled/required/optional encryption modes. Each verifies tool results, errors, and progress over a localhost-only relay. These exercise wire compatibility; they do not deploy either version to production.
- No real payment, public post, physical Android launch, mixed-version ContextVM deployment, signed release, or hardware/remote signer approval was performed. Those remain environment-specific release checks.

### Comment-count correction

A local fixture reproduced a loaded one-comment thread whose station card still showed `?`. COUNT can remain refreshing while the scheduler waits for a usable relay; the old fallback waited for refreshing to stop. A separately timed fallback now starts after three seconds without a count. Loaded and newly posted comments are always shown, with `1+` when they are only a known minimum; a failed query with no known comments remains unknown. Regression tests cover pending COUNT, stale zero, successful-count cancellation, failed fallback, and teardown. The original browser reproduction now displays the loaded count. POSIX process-group tests run on macOS/Linux; native Windows builds skip those WSL-only development checks.

## Release readiness

Pushing `main` triggers the VPS workflow, which checks types/tests and deploys the frontend, relay, and ContextVM server together. The archive now includes the runtime helper scripts used for health checks, bandwidth sampling, migration, and reindexing. It excludes persistent relay data, local binaries, dependencies, and source maps. Deployment replaces only the three WaveFunc PM2 services, preserving other apps and the log-rotation module. Local deployment builds explicitly set the production stage. Workflow YAML, shell syntax, an actual archive built from a disposable fixture, and scoped PM2 cleanup with stub services were checked.

The web/server changes are ready for rollout with post-deploy smoke checks. Version 0.1.12 is prepared across the frontend and native manifests. The tag workflow builds native packages and publishes its draft automatically once all native build jobs succeed. Physical-device and real-payment checks remain manual.
