import NDK, { NDKEvent, type NostrEvent } from "@nostr-dev-kit/react";
import NDKReplaceableEvent from "./NDKReplaceableEvent";

/**
 * The type of content being featured.
 * Extend this union when adding new feature types (stations, users, etc.).
 */
export type AdminFeatureType = "lists" | "stations" | "users";

const LABEL_PREFIX = "wavefunc:featured:";

/**
 * NDKWFAdminFeature — Admin-managed curated reference list (kind 30078).
 *
 * An admin feature event is simply a bag of `a`-tag (or `p`-tag) references
 * with a typed label. It carries no display metadata of its own — names,
 * descriptions and images come from the referenced entities.
 *
 * Label convention: `wavefunc:featured:<type>`
 *   - wavefunc:featured:lists    → references NDKWFFavorites events
 *   - wavefunc:featured:stations → references NDKStation events (future)
 *   - wavefunc:featured:users    → references user pubkeys via p-tags (future)
 */
export class NDKWFAdminFeature extends NDKReplaceableEvent {
  static kinds = [30078];

  static labelFor(type: AdminFeatureType): string {
    return `${LABEL_PREFIX}${type}`;
  }

  static typeFromLabel(label: string): AdminFeatureType | null {
    if (!label.startsWith(LABEL_PREFIX)) return null;
    return label.slice(LABEL_PREFIX.length) as AdminFeatureType;
  }

  static from(event: NDKEvent): NDKWFAdminFeature {
    return new NDKWFAdminFeature(event.ndk, event);
  }

  /** Create a new, empty admin feature event of the given type. */
  static create(ndk: NDK, type: AdminFeatureType): NDKWFAdminFeature {
    const feature = new NDKWFAdminFeature(ndk);
    feature.featureId = crypto.randomUUID();
    feature.featureType = type;
    return feature;
  }

  constructor(ndk: NDK | undefined, rawEvent?: NostrEvent | NDKEvent) {
    super(ndk, rawEvent);
    this.kind ??= 30078;
  }

  // ─── Identity ──────────────────────────────────────────────────────────────

  get featureId(): string | undefined {
    return this.tagValue("d");
  }

  set featureId(id: string) {
    this.removeTag("d");
    this.tags.push(["d", id]);
  }

  get featureType(): AdminFeatureType | null {
    const label = this.tagValue("l");
    if (!label) return null;
    return NDKWFAdminFeature.typeFromLabel(label);
  }

  set featureType(type: AdminFeatureType) {
    this.removeTag("l");
    this.tags.push(["l", NDKWFAdminFeature.labelFor(type)]);
  }

  // ─── Reference management ─────────────────────────────────────────────────

  /** All `a`-tag addresses stored in this feature event. */
  getRefs(): string[] {
    return this.getMatchingTags("a")
      .map((tag) => tag[1])
      .filter((addr): addr is string => Boolean(addr));
  }

  hasRef(address: string): boolean {
    return this.getRefs().includes(address);
  }

  addRef(address: string): void {
    if (!this.hasRef(address)) {
      this.tags.push(["a", address]);
    }
  }

  removeRef(address: string): boolean {
    const before = this.tags.length;
    this.tags = this.tags.filter(
      (tag) => !(tag[0] === "a" && tag[1] === address)
    );
    return this.tags.length !== before;
  }

  // ─── Publishing ───────────────────────────────────────────────────────────

  async publishRefs(): Promise<void> {
    await this.prepareReplaceablePublish();
    await this.sign();
    await this.publish();
  }

  async addRefAndPublish(address: string): Promise<boolean> {
    if (this.hasRef(address)) return false;
    this.addRef(address);
    await this.publishRefs();
    return true;
  }

  async removeRefAndPublish(address: string): Promise<boolean> {
    const removed = this.removeRef(address);
    if (removed) await this.publishRefs();
    return removed;
  }

  /** Publish a NIP-09 deletion event for this feature group. */
  async deleteFeature(): Promise<void> {
    if (!this.ndk || !this.id) return;
    const deletion = new NDKEvent(this.ndk);
    deletion.kind = 5;
    deletion.content = "Deleted admin feature group";
    deletion.tags = [
      ["e", this.id],
      ["k", "30078"],
    ];
    if (this.featureId) {
      deletion.tags.push(["a", `30078:${this.pubkey}:${this.featureId}`]);
    }
    await deletion.sign();
    await deletion.publish();
    if (this.ndk.cacheAdapter?.deleteEventIds) {
      await this.ndk.cacheAdapter.deleteEventIds([this.id]);
    }
  }
}

export default NDKWFAdminFeature;
