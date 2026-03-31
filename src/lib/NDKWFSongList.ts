import NDK, { NDKEvent, type NostrEvent } from "@nostr-dev-kit/react";
import NDKReplaceableEvent from "./NDKReplaceableEvent";

export const SONG_LIST_LABEL = "wavefunc_user_song_list";

export class NDKWFSongList extends NDKReplaceableEvent {
  static kinds = [30078];

  static from(event: NDKEvent): NDKWFSongList {
    return new NDKWFSongList(event.ndk, event);
  }

  constructor(ndk?: NDK, rawEvent?: NostrEvent | NDKEvent) {
    super(ndk, rawEvent);
    this.kind ??= 30078;
    if (!this.tagValue("l")) {
      this.tags.push(["l", SONG_LIST_LABEL]);
    }
  }

  get listId(): string | undefined {
    return this.tagValue("d");
  }

  get name(): string | undefined {
    return this.tagValue("name");
  }

  get description(): string | undefined {
    return this.tagValue("description");
  }

  get address(): string {
    return `30078:${this.pubkey}:${this.listId}`;
  }

  getSongs(): string[] {
    return this.getMatchingTags("a")
      .map((tag) => tag[1])
      .filter((a): a is string => Boolean(a) && a.startsWith("31337:"));
  }

  hasSong(songAddress: string): boolean {
    return this.getSongs().includes(songAddress);
  }

  addSong(songAddress: string, relay?: string): void {
    if (!songAddress.startsWith("31337:")) {
      throw new Error("Invalid song address, must start with '31337:'");
    }
    if (!this.hasSong(songAddress)) {
      const tag: string[] = ["a", songAddress];
      if (relay) tag.push(relay);
      this.tags.push(tag);
    }
  }

  removeSong(songAddress: string): boolean {
    const before = this.tags.length;
    this.tags = this.tags.filter((t) => !(t[0] === "a" && t[1] === songAddress));
    return this.tags.length !== before;
  }

  async addSongAndPublish(songAddress: string, relay?: string): Promise<boolean> {
    if (this.hasSong(songAddress)) return false;
    this.addSong(songAddress, relay);
    await this.prepareReplaceablePublish();
    await this.sign();
    const relays = await this.publish();
    if (relays.size === 0) throw new Error("Failed to publish to any relay");
    return true;
  }

  async removeSongAndPublish(songAddress: string): Promise<boolean> {
    const removed = this.removeSong(songAddress);
    if (removed) {
      await this.prepareReplaceablePublish();
      await this.sign();
      await this.publish();
    }
    return removed;
  }

  getSongCount(): number {
    return this.getSongs().length;
  }

  static createDefault(ndk: NDK, name = "Liked Songs"): NDKWFSongList {
    const list = new NDKWFSongList(ndk);
    list.tags.push(["d", crypto.randomUUID()]);
    list.tags.push(["name", name]);
    list.content = "";
    return list;
  }
}

export default NDKWFSongList;
