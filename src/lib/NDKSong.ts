import NDK, { NDKEvent, type NostrEvent } from "@nostr-dev-kit/react";

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

export class NDKSong extends NDKEvent {
  static kinds = [31337];

  static from(event: NDKEvent): NDKSong {
    return new NDKSong(event.ndk, event);
  }

  constructor(ndk?: NDK, rawEvent?: NostrEvent | NDKEvent) {
    super(ndk, rawEvent);
    this.kind ??= 31337;
  }

  get songId(): string | undefined {
    return this.tagValue("d");
  }

  get title(): string | undefined {
    return this.tagValue("title");
  }

  get artist(): string | undefined {
    return this.tags.find((t) => t[0] === "c" && t[2] === "artist")?.[1];
  }

  get album(): string | undefined {
    return this.tags.find((t) => t[0] === "c" && t[2] === "album")?.[1];
  }

  get mbid(): string | undefined {
    return this.tags.find((t) => t[0] === "i" && t[1]?.startsWith("mbid:"))?.[1]?.slice(5);
  }

  get releaseId(): string | undefined {
    return this.tags
      .find((t) => t[0] === "i" && t[1]?.startsWith("release-mbid:"))?.[1]
      ?.slice(13);
  }

  get coverArt(): string | undefined {
    return this.tagValue("image");
  }

  get thumb(): string | undefined {
    return this.tagValue("thumb");
  }

  get duration(): number | undefined {
    const v = this.tagValue("duration");
    return v ? parseInt(v, 10) : undefined;
  }

  get releaseYear(): number | undefined {
    const v = this.tagValue("published_at");
    if (!v) return undefined;
    return new Date(parseInt(v, 10) * 1000).getUTCFullYear();
  }

  get genres(): string[] {
    return this.getMatchingTags("t")
      .map((t) => t[1])
      .filter(Boolean) as string[];
  }

  get address(): string {
    return `31337:${this.pubkey}:${this.songId}`;
  }

  /**
   * Build a kind 31337 event from current player metadata.
   * Uses MBID for the stable d-tag when available, falls back to a slug.
   */
  static fromMetadata(
    ndk: NDK,
    metadata: {
      song?: string;
      artist?: string;
      musicBrainz?: {
        id: string;
        title: string;
        artist: string;
        release?: string;
        releaseId?: string;
        releaseDate?: string;
        duration?: number;
        tags?: string[];
      };
    },
    pubkey: string
  ): NDKSong {
    const song = new NDKSong(ndk);
    song.pubkey = pubkey;

    const mb = metadata.musicBrainz;
    const title = mb?.title || metadata.song || "";
    const artist = mb?.artist || metadata.artist || "";

    const dTag = mb?.id
      ? `mb-${mb.id}`
      : slugify(`${title}-by-${artist}`) || crypto.randomUUID();

    song.tags.push(["d", dTag]);
    song.tags.push(["title", title]);

    if (artist) song.tags.push(["c", artist, "artist"]);
    if (mb?.release) song.tags.push(["c", mb.release, "album"]);

    if (mb?.id) song.tags.push(["i", `mbid:${mb.id}`]);

    if (mb?.releaseId) {
      song.tags.push(["i", `release-mbid:${mb.releaseId}`]);
      song.tags.push(["image", `https://coverartarchive.org/release/${mb.releaseId}/front-500`]);
      song.tags.push(["thumb", `https://coverartarchive.org/release/${mb.releaseId}/front-250`]);
    }

    if (mb?.duration) {
      song.tags.push(["duration", Math.round(mb.duration / 1000).toString()]);
    }

    if (mb?.releaseDate) {
      const year = parseInt(mb.releaseDate.split("-")[0], 10);
      if (!isNaN(year)) {
        song.tags.push(["published_at", Math.floor(Date.UTC(year, 0, 1) / 1000).toString()]);
      }
    }

    if (mb?.tags) {
      for (const tag of mb.tags.slice(0, 5)) {
        song.tags.push(["t", tag]);
      }
    }

    song.content = "";
    song.created_at = Math.floor(Date.now() / 1000);

    return song;
  }
}

export default NDKSong;
