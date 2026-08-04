import { describe, expect, test } from "bun:test";
import {
  createMediaAcquirer,
  createTauriMediaAdapter,
  mediaAcquisitionAvailability,
  type NativeMediaAdapter,
} from "../src/lib/mediaAcquisition";
import { platformInfo } from "../src/lib/platform";

describe("client media acquisition", () => {
  test("uses local acquisition in installed desktop and Android apps", () => {
    expect(mediaAcquisitionAvailability(platformInfo("android", true))).toEqual({
      mode: "local",
    });
    expect(mediaAcquisitionAvailability(platformInfo("macos", true))).toEqual({
      mode: "local",
    });
    expect(mediaAcquisitionAvailability(platformInfo("windows", true))).toEqual({
      mode: "local",
    });
    expect(mediaAcquisitionAvailability(platformInfo("linux", true))).toEqual({
      mode: "local",
    });
  });

  test("directs web and unsupported native platforms to a supported app", () => {
    expect(mediaAcquisitionAvailability(platformInfo("web", false))).toEqual({
      mode: "app-required",
      reason: "Install WaveFunc for Android or desktop to save media locally.",
    });
    expect(mediaAcquisitionAvailability(platformInfo("ios", true))).toEqual({
      mode: "app-required",
      reason: "Install WaveFunc for Android or desktop to save media locally.",
    });
  });

  test("authorizes the prepared hash for only the selected Blossom server", async () => {
    const calls: { auth?: any; upload?: any } = {};
    const adapter: NativeMediaAdapter = {
      async prepare() {
        return {
          jobId: "job-1",
          sha256: "abc123",
          size: 42,
          mimeType: "audio/webm",
        };
      },
      async upload(payload) {
        calls.upload = payload;
        return {
          url: "https://blossom.example/abc123",
          sha256: "abc123",
          size: 42,
          mimeType: "audio/webm",
        };
      },
      async discard() {},
      async cancel() {},
    };
    const acquirer = createMediaAcquirer(adapter, () => 1_700_000_000);

    const saved = await acquirer.save({
      videoId: "dQw4w9WgXcQ",
      format: "audio",
      blossomUrl: "https://Blossom.Example/upload",
      async signEvent(template) {
        calls.auth = template;
        return { ...template, id: "signed", pubkey: "pubkey", sig: "sig" };
      },
    });

    expect(calls.auth).toMatchObject({
      kind: 24242,
      created_at: 1_700_000_000,
      tags: [
        ["t", "upload"],
        ["x", "abc123"],
        ["expiration", "1700000600"],
        ["server", "blossom.example"],
      ],
    });
    expect(calls.upload).toEqual({
      jobId: "job-1",
      blossomUrl: "https://blossom.example/upload",
      signedAuthEvent: JSON.stringify({
        ...calls.auth,
        id: "signed",
        pubkey: "pubkey",
        sig: "sig",
      }),
    });
    expect(saved.url).toBe("https://blossom.example/abc123");
  });

  test("discards the local file if signing or upload fails", async () => {
    const discarded: string[] = [];
    const adapter: NativeMediaAdapter = {
      async prepare() {
        return {
          jobId: "job-to-clean",
          sha256: "deadbeef",
          size: 10,
          mimeType: "video/mp4",
        };
      },
      async upload() {
        throw new Error("upload failed");
      },
      async discard(jobId) {
        discarded.push(jobId);
      },
      async cancel() {},
    };

    await expect(
      createMediaAcquirer(adapter).save({
        videoId: "dQw4w9WgXcQ",
        format: "720p",
        blossomUrl: "https://blossom.example",
        async signEvent(template) {
          return template;
        },
      }),
    ).rejects.toThrow("upload failed");

    expect(discarded).toEqual(["job-to-clean"]);
  });

  test("shows signer approval and times out instead of displaying stale download progress forever", async () => {
    const stages: string[] = [];
    const discarded: string[] = [];
    const adapter: NativeMediaAdapter = {
      async prepare() {
        return {
          jobId: "pixel-signer-job",
          sha256: "pixel-signer-hash",
          size: 42,
          mimeType: "video/mp4",
        };
      },
      async upload() {
        throw new Error("must not upload without authorization");
      },
      async discard(jobId) {
        discarded.push(jobId);
      },
      async cancel() {},
    };

    const outcome = await Promise.race([
      createMediaAcquirer(
        adapter,
        () => 1_700_000_000,
        5,
      ).save({
        videoId: "dQw4w9WgXcQ",
        format: "360p",
        blossomUrl: "https://blossom.example",
        signEvent: () => new Promise(() => undefined),
        onProgress: ({ stage }) => stages.push(stage),
      }).then(
        () => "unexpected-success",
        (error) => (error as Error).message,
      ),
      new Promise<"test-timeout">((resolve) =>
        setTimeout(() => resolve("test-timeout"), 50),
      ),
    ]);

    expect(outcome).toContain("Signer approval timed out");
    expect(stages).toContain("authorizing");
    expect(discarded).toEqual(["pixel-signer-job"]);
  });

  test("rejects malformed video IDs before invoking native code", async () => {
    let prepared = false;
    const adapter: NativeMediaAdapter = {
      async prepare() {
        prepared = true;
        throw new Error("must not run");
      },
      async upload() {
        throw new Error("must not run");
      },
      async discard() {},
      async cancel() {},
    };

    await expect(
      createMediaAcquirer(adapter).save({
        videoId: "https://example.com/not-a-video",
        format: "audio",
        blossomUrl: "https://blossom.example",
        async signEvent(template) {
          return template;
        },
      }),
    ).rejects.toThrow("Invalid YouTube video ID");
    expect(prepared).toBe(false);
  });

  test("maps the shared adapter to the narrow Tauri plugin commands", async () => {
    const calls: Array<[string, unknown]> = [];
    const invoke = async <T>(command: string, args?: unknown): Promise<T> => {
      calls.push([command, args]);
      if (command.endsWith("|prepare")) {
        return {
          jobId: "job-2",
          sha256: "hash",
          size: 99,
          mimeType: "audio/webm",
        } as T;
      }
      if (command.endsWith("|upload")) {
        return {
          url: "https://blossom.example/hash",
          sha256: "hash",
          size: 99,
          mimeType: "audio/webm",
        } as T;
      }
      return undefined as T;
    };
    const adapter = createTauriMediaAdapter(invoke, {
      createJobId: () => "job-2",
    });

    await adapter.prepare({ videoId: "dQw4w9WgXcQ", format: "audio" });
    await adapter.upload({
      jobId: "job-2",
      blossomUrl: "https://blossom.example/",
      signedAuthEvent: "{}",
    });
    await adapter.discard("job-2");
    await adapter.cancel("job-3");

    expect(calls).toEqual([
      [
        "plugin:wavefunc-media|prepare",
        {
          payload: {
            videoId: "dQw4w9WgXcQ",
            format: "audio",
            jobId: "job-2",
          },
        },
      ],
      [
        "plugin:wavefunc-media|upload",
        {
          payload: {
            jobId: "job-2",
            blossomUrl: "https://blossom.example/",
            signedAuthEvent: "{}",
          },
        },
      ],
      ["plugin:wavefunc-media|discard", { jobId: "job-2" }],
      ["plugin:wavefunc-media|cancel", { jobId: "job-3" }],
    ]);
  });

  test("recovers a completed preparation when the one-shot native response is lost", async () => {
    const prepared = {
      jobId: "pixel-background-job",
      sha256: "pixel-hash",
      size: 5_209_456,
      mimeType: "video/mp4",
    };
    const neverResolves = new Promise<never>(() => undefined);
    let statusChecks = 0;
    let prepareArgs: unknown;
    const invoke = async <T>(command: string, args?: unknown): Promise<T> => {
      if (command.endsWith("|prepare")) {
        prepareArgs = args;
        return neverResolves;
      }
      if (command.endsWith("|status")) {
        statusChecks += 1;
        return (statusChecks === 1
          ? { state: "preparing" }
          : { state: "prepared", media: prepared }) as T;
      }
      throw new Error(`Unexpected command: ${command}`);
    };
    const adapter = createTauriMediaAdapter(invoke, {
      createJobId: () => prepared.jobId,
      pollIntervalMs: 0,
    });

    const result = await Promise.race([
      adapter.prepare({ videoId: "dQw4w9WgXcQ", format: "360p" }),
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 50)),
    ]);

    expect(result).toEqual(prepared);
    expect(statusChecks).toBeGreaterThanOrEqual(2);
    expect(prepareArgs).toEqual({
      payload: {
        videoId: "dQw4w9WgXcQ",
        format: "360p",
        jobId: prepared.jobId,
      },
    });
  });

  test("normalizes native string rejections into actionable Error objects", async () => {
    const adapter = createTauriMediaAdapter(async () => {
      throw "ERROR: Requested format is not available";
    });

    try {
      await adapter.prepare({ videoId: "dQw4w9WgXcQ", format: "360p" });
      throw new Error("Expected native preparation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain(
        "Requested format is not available",
      );
    }
  });
});
