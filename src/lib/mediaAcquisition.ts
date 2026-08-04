import type { PlatformInfo } from "./platform";

export type MediaFormat = "audio" | "360p" | "480p" | "720p";

export interface PreparedMedia {
  jobId: string;
  sha256: string;
  size: number;
  mimeType: string;
}

interface NativePreparationStatus {
  state: "missing" | "preparing" | "prepared" | "failed";
  media?: PreparedMedia;
  error?: string;
}

export interface UploadedMedia {
  url: string;
  sha256: string;
  size: number;
  mimeType: string;
}

export interface MediaProgress {
  stage: "preparing" | "downloading" | "hashing" | "authorizing" | "uploading";
  progress?: number;
  message?: string;
}

export interface NativeMediaAdapter {
  prepare(
    payload: { videoId: string; format: MediaFormat },
    onProgress?: (progress: MediaProgress) => void,
  ): Promise<PreparedMedia>;
  upload(
    payload: {
      jobId: string;
      blossomUrl: string;
      signedAuthEvent: string;
    },
    onProgress?: (progress: MediaProgress) => void,
  ): Promise<UploadedMedia>;
  discard(jobId: string): Promise<void>;
  cancel(jobId: string): Promise<void>;
}

export interface UnsignedEvent {
  kind: number;
  content: string;
  created_at: number;
  tags: string[][];
}

export interface SaveMediaRequest {
  videoId: string;
  format: MediaFormat;
  blossomUrl: string;
  signEvent(event: UnsignedEvent): unknown | Promise<unknown>;
  onProgress?: (progress: MediaProgress) => void;
}

export type NativeInvoke = <T>(command: string, args?: unknown) => Promise<T>;

interface TauriMediaAdapterOptions {
  createJobId?: () => string;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
}

export type MediaAcquisitionAvailability =
  | { mode: "local" }
  | { mode: "app-required"; reason: string };

const APP_REQUIRED_REASON =
  "Install WaveFunc for Android or desktop to save media locally.";

export function mediaErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function nativeMediaError(error: unknown, fallback: string): Error {
  return error instanceof Error
    ? error
    : new Error(mediaErrorMessage(error, fallback));
}

function createMediaJobId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function withTimeout<T>(
  promise: Promise<T>,
  milliseconds: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), milliseconds);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Media extraction has to run in an installed app so it shares the user's
 * network identity and can continue while the web view is backgrounded.
 */
export function mediaAcquisitionAvailability(
  platform: PlatformInfo,
): MediaAcquisitionAvailability {
  if (
    platform.isTauri &&
    (platform.isAndroid || platform.isDesktop)
  ) {
    return { mode: "local" };
  }

  return { mode: "app-required", reason: APP_REQUIRED_REASON };
}

export function createMediaAcquirer(
  adapter: NativeMediaAdapter,
  now: () => number = () => Math.floor(Date.now() / 1000),
  signerTimeoutMs = 90_000,
) {
  return {
    async save(request: SaveMediaRequest): Promise<UploadedMedia> {
      if (!/^[A-Za-z0-9_-]{11}$/.test(request.videoId)) {
        throw new Error("Invalid YouTube video ID.");
      }

      const blossomUrl = new URL(request.blossomUrl);
      if (blossomUrl.protocol !== "https:") {
        throw new Error("Blossom uploads require an HTTPS server.");
      }

      const prepared = await adapter.prepare(
        { videoId: request.videoId, format: request.format },
        request.onProgress,
      );

      try {
        const createdAt = now();
        request.onProgress?.({
          stage: "authorizing",
          message: "Waiting for approval in your Nostr signer…",
        });
        const authEvent = await withTimeout(
          Promise.resolve(request.signEvent({
            kind: 24242,
            content: `Upload ${request.format} to ${blossomUrl.hostname.toLowerCase()}`,
            created_at: createdAt,
            tags: [
              ["t", "upload"],
              ["x", prepared.sha256],
              ["expiration", String(createdAt + 600)],
              ["server", blossomUrl.hostname.toLowerCase()],
            ],
          })),
          signerTimeoutMs,
          "Signer approval timed out. Open your signer app, check its connection, and try again.",
        );

        return await adapter.upload(
          {
            jobId: prepared.jobId,
            blossomUrl: blossomUrl.toString(),
            signedAuthEvent: JSON.stringify(authEvent),
          },
          request.onProgress,
        );
      } catch (error) {
        await adapter.discard(prepared.jobId).catch(() => undefined);
        throw error;
      }
    },
  };
}

export function createTauriMediaAdapter(
  invoke: NativeInvoke,
  options: TauriMediaAdapterOptions = {},
): NativeMediaAdapter {
  const createJobId = options.createJobId ?? createMediaJobId;
  const pollIntervalMs = options.pollIntervalMs ?? 1_000;
  const maxPollAttempts = options.maxPollAttempts ?? 16 * 60;

  return {
    async prepare(payload, onProgress) {
      onProgress?.({ stage: "preparing", message: "Preparing local download…" });
      const jobId = createJobId();
      let settled = false;
      const directResponse = invoke<PreparedMedia>("plugin:wavefunc-media|prepare", {
        payload: { ...payload, jobId },
      });
      const recoveredResponse = (async (): Promise<PreparedMedia> => {
        for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
          await wait(pollIntervalMs);
          if (settled) return new Promise<PreparedMedia>(() => undefined);

          let status: NativePreparationStatus;
          try {
            status = await invoke<NativePreparationStatus>(
              "plugin:wavefunc-media|status",
              { jobId },
            );
          } catch {
            // The WebView/native bridge can be temporarily unavailable while
            // Android backgrounds the activity. The direct response may still
            // arrive, and the next status check can recover it after resume.
            continue;
          }

          if (status.state === "prepared" && status.media) return status.media;
          if (status.state === "failed") {
            throw new Error(status.error || "Local media download failed.");
          }
        }
        throw new Error("Local media preparation timed out. Please try again.");
      })();

      try {
        return await Promise.race([directResponse, recoveredResponse]);
      } catch (error) {
        throw nativeMediaError(error, "Local media download failed.");
      } finally {
        settled = true;
      }
    },
    async upload(payload, onProgress) {
      onProgress?.({ stage: "uploading", message: "Uploading to Blossom…" });
      try {
        return await invoke<UploadedMedia>("plugin:wavefunc-media|upload", {
          payload,
        });
      } catch (error) {
        throw nativeMediaError(error, "Blossom upload failed.");
      }
    },
    async discard(jobId) {
      try {
        await invoke<void>("plugin:wavefunc-media|discard", { jobId });
      } catch (error) {
        throw nativeMediaError(error, "Could not discard local media.");
      }
    },
    async cancel(jobId) {
      try {
        await invoke<void>("plugin:wavefunc-media|cancel", { jobId });
      } catch (error) {
        throw nativeMediaError(error, "Could not cancel media download.");
      }
    },
  };
}

let installedAcquirer: Promise<ReturnType<typeof createMediaAcquirer>> | null = null;

export function createInstalledMediaAcquirer() {
  installedAcquirer ??= (async () => {
    const { invoke, addPluginListener } = await import("@tauri-apps/api/core");
    const native = createTauriMediaAdapter(invoke as NativeInvoke);
    let activeProgress: SaveMediaRequest["onProgress"];
    let activeTransfer = false;

    // The Android engine reports real yt-dlp and upload progress. Desktop has
    // the same command surface and receives the coarse stage updates below.
    await addPluginListener<MediaProgress>(
      "wavefunc-media",
      "progress",
      (event) => activeProgress?.(event),
    );

    const adapter: NativeMediaAdapter = {
      ...native,
      async prepare(payload, onProgress) {
        if (activeTransfer) {
          throw new Error("Another media transfer is already running.");
        }
        activeTransfer = true;
        activeProgress = onProgress;
        try {
          return await native.prepare(payload, onProgress);
        } catch (error) {
          activeProgress = undefined;
          activeTransfer = false;
          throw error;
        }
      },
      async upload(payload, onProgress) {
        activeProgress = onProgress;
        try {
          return await native.upload(payload, onProgress);
        } finally {
          activeProgress = undefined;
          activeTransfer = false;
        }
      },
      async discard(jobId) {
        activeProgress = undefined;
        activeTransfer = false;
        await native.discard(jobId);
      },
      async cancel(jobId) {
        activeProgress = undefined;
        activeTransfer = false;
        await native.cancel(jobId);
      },
    };
    return createMediaAcquirer(adapter);
  })();

  return installedAcquirer;
}
