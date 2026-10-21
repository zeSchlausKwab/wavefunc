# Nostr follow-ups and app supporters

Implementation work begun October 21, 2026. Keep separate commits for independently reviewable changes. Preserve existing local configuration and unrelated notes.

## Authorized scope

- [ ] Verified app-support leaderboard: all-time top five identified public senders, names/avatars/sats, beside featured collections in a desktop 2:1 split; stack on mobile.
- [ ] Mark new support requests using NIP-32 self-labels inside signed NIP-57 requests. User-approved historical exception: verified direct-to-profile receipts dated before 2026-10-21 08:58:13 UTC seed the board. New unmarked profile zaps and historical post zaps need explicit confirmation by the receiving account, represented by signed NIP-32 labeling events. Never infer attribution from comments alone.
- [ ] Android development launcher uses owned processes and explicit cancellation.
- [ ] ContextVM SDK compatibility upgrade with client/server loopback protocol checks.
- [ ] Bounded outbox discovery plus advisory NIP-66 relay information; keep role isolation and connection budgets.
- [ ] Opt-in NIP-38 listening status with account ownership, expiration, pause/stop clearing, and visible controls.
- [ ] Optional protected persistent decryption cache, explicit unlock/clear controls, account isolation, and lock/logout cleanup.
- [ ] Integration checks, frontend/browser verification, documentation, and commits.

The earlier performance sample is synthetic. Optimistic verification and replacing all storage remain contingent on profiling evidence; verified ingestion and durable wallet backups must remain intact.

## Protocol references

- [NIP-57](https://github.com/nostr-protocol/nips/blob/master/57.md): validate provider signer, request, invoice amount, LNURL, and receipt binding; receipts attest to payment according to the LNURL provider.
- [NIP-32](https://github.com/nostr-protocol/nips/blob/master/32.md): self-labels and labels on existing events, using an unambiguous namespace.
- [NIP-38](https://github.com/nostr-protocol/nips/blob/master/38.md): expiring music status, empty content to clear.
- [NIP-66](https://github.com/nostr-protocol/nips/blob/master/66.md): monitor reports are advisory and cannot be required for relay connections.

Real payments, public status publication, authenticated device testing, and signed releases require the relevant user-controlled wallets/devices/credentials. Do not make payments or publish events merely to test implementation.
