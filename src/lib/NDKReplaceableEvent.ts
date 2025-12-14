import type { NostrEvent } from "@nostr-dev-kit/react";
import NDK, { NDKEvent } from "@nostr-dev-kit/react";

// Base class for parameterized replaceable events (NIP-33),
// encapsulating cache invalidation and publish preparation.
export class NDKReplaceableEvent extends NDKEvent {
  constructor(ndk?: NDK, rawEvent?: NostrEvent | NDKEvent) {
    super(ndk, rawEvent);
  }

  protected getDTag(): string | undefined {
    return this.tagValue("d");
  }

  bumpTimestamp(): void {
    this.created_at = Math.floor(Date.now() / 1000);
  }

  async ensureConnected(): Promise<void> {
    try {
      if (!this.ndk) return;
      const pool = (this.ndk as any).pool;
      const connected = pool?.connectedRelays?.().length ?? 0;
      if (connected === 0) {
        await this.ndk.connect();
        // Give relays a brief moment to finish connecting.
        await new Promise((res) => setTimeout(res, 500));
      }
    } catch (_) {
      // Best-effort; ignore connection issues here.
    }
  }

  // Delete any cached entries for this replaceable event before publishing.
  async invalidateReplaceableCache(): Promise<void> {
    const adapter: any = this.ndk?.cacheAdapter;
    if (!adapter) return;

    try {
      // If we have an ID, delete it directly.
      if (typeof adapter.deleteEventIds === "function" && this.id) {
        await adapter.deleteEventIds([this.id]);
      }

      // Also delete by replaceable key (kind + author + d), if possible.
      const kinds = this.kind ? [this.kind] : undefined;
      const authors = this.pubkey ? [this.pubkey] : undefined;
      const dTag = this.getDTag();
      const d = dTag ? [dTag] : undefined;

      if (adapter.query && kinds && authors && d) {
        const filter = { kinds, authors, "#d": d } as any;
        const cachedEvents = await adapter.query(filter);
        if (Array.isArray(cachedEvents) && cachedEvents.length && adapter.deleteEventIds) {
          const ids = cachedEvents.map((e: any) => e.id).filter(Boolean);
          if (ids.length) await adapter.deleteEventIds(ids);
        }
      }
    } catch (_) {
      // Swallow adapter-specific errors; invalidation is best-effort.
    }
  }

  // Convenience to run common steps before publishing updates.
  async prepareReplaceablePublish(): Promise<void> {
    this.bumpTimestamp();
    await this.invalidateReplaceableCache();
    await this.ensureConnected();
  }
}

export default NDKReplaceableEvent;