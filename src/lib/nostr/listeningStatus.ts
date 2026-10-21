import type { EventTemplate } from "applesauce-core/helpers/event";
export type ListeningTrack = {
  title: string;
  artist?: string;
  address?: string;
  url?: string;
};
export function listeningTemplate(
  track: ListeningTrack | null,
  now: number,
): EventTemplate {
  return {
    kind: 30315,
    created_at: now,
    content: track
      ? [track.artist, track.title].filter(Boolean).join(" - ").slice(0, 300)
      : "",
    tags: [
      ["d", "music"],
      ["expiration", String(now + 300)],
      ...(track?.url ? [["r", track.url]] : []),
      ...(track?.address ? [["a", track.address]] : []),
    ],
  };
}
/** Serialize signer prompts; a newer state supersedes a queued old track. */
export class ListeningStatusPublisher {
  private revision = 0;
  private running: Promise<void> = Promise.resolve();
  private lastTime = 0;
  private sent = false;
  private stopped = false;
  constructor(
    private publish: (
      event: EventTemplate,
      stillCurrent: () => boolean,
    ) => Promise<void>,
    private now = () => Math.floor(Date.now() / 1000),
  ) {}
  update(track: ListeningTrack | null) {
    if (this.stopped) return Promise.resolve();
    const revision = ++this.revision;
    this.running = this.running
      .catch(() => undefined)
      .then(async () => {
        if (revision !== this.revision || (!track && !this.sent)) return;
        const at = Math.max(this.now(), this.lastTime + 1);
        this.lastTime = at;
        // Remember an uncertain broadcast so stopping still attempts a clear.
        this.sent = true;
        await this.publish(
          listeningTemplate(track, at),
          () => revision === this.revision,
        );
        this.sent = !!track;
      });
    return this.running;
  }
  async stop() {
    const result = this.update(null);
    this.stopped = true;
    await result;
  }
}
