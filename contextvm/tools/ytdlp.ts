import { mkdirSync, rmSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ─── yt-dlp binary resolution ─────────────────────────────────────────────────
// Place the executable at contextvm/bin/yt-dlp (or set YTDLP_PATH).
// Download it from https://github.com/yt-dlp/yt-dlp/releases/latest
//   macOS:  curl -L .../yt-dlp_macos -o contextvm/bin/yt-dlp && chmod +x contextvm/bin/yt-dlp
//   Linux:  curl -L .../yt-dlp       -o contextvm/bin/yt-dlp && chmod +x contextvm/bin/yt-dlp

const LOCAL_BIN = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "yt-dlp");

let resolvedBin: string | null = null;
let cachedCaps: { audio: boolean; webm: boolean } | null = null;
let cachedCommonArgsKey: string | null = null;
let cachedCommonArgs: string[] | null = null;

interface FfmpegCaps { audio: boolean; webm: boolean }

async function ffmpegCaps(): Promise<FfmpegCaps> {
  if (cachedCaps) return cachedCaps;

  const which = Bun.spawn(["which", "ffmpeg"], { stdout: "pipe", stderr: "pipe" });
  if ((await which.exited) !== 0) {
    console.log("[yt-dlp] ffmpeg not found — using pre-merged formats");
    return (cachedCaps = { audio: false, webm: false });
  }

  const enc = Bun.spawn(["ffmpeg", "-encoders"], { stdout: "pipe", stderr: "pipe" });
  const out = await new Response(enc.stdout).text();
  await enc.exited;

  const audio = out.includes("libmp3lame");
  const webm  = out.includes("libvpx-vp9");
  console.log(`[yt-dlp] ffmpeg caps — mp3: ${audio}, webm/vp9: ${webm}`);
  return (cachedCaps = { audio, webm });
}

async function ensureYtDlp(): Promise<string> {
  if (resolvedBin) return resolvedBin;

  if (process.env.YTDLP_PATH) {
    resolvedBin = process.env.YTDLP_PATH;
    return resolvedBin;
  }

  // Check local bin first, then fall back to system PATH
  const localCheck = Bun.file(LOCAL_BIN);
  if (await localCheck.exists()) {
    resolvedBin = LOCAL_BIN;
    return resolvedBin;
  }

  // Try system PATH
  const which = Bun.spawn(["which", "yt-dlp"], { stdout: "pipe", stderr: "pipe" });
  if ((await which.exited) === 0) {
    resolvedBin = "yt-dlp";
    return resolvedBin;
  }

  throw new Error(
    `yt-dlp not found. Place the binary at contextvm/bin/yt-dlp or set YTDLP_PATH.\n` +
    `Download: https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos (macOS) or yt-dlp (Linux)`
  );
}

function getCommonYtDlpArgs(): string[] {
  const cookiesFile = process.env.YTDLP_COOKIES_FILE?.trim() || "";
  const proxy = process.env.YTDLP_PROXY?.trim() || "";
  const playerClients = process.env.YTDLP_PLAYER_CLIENTS?.trim() || "";
  const jsRuntimesEnv = process.env.YTDLP_JS_RUNTIMES?.trim() || "";
  const cacheKey = JSON.stringify([cookiesFile, proxy, playerClients, jsRuntimesEnv, process.execPath]);

  if (cachedCommonArgs && cachedCommonArgsKey === cacheKey) return [...cachedCommonArgs];

  const args: string[] = [];

  // yt-dlp's EJS flow only enables Deno by default. Node and Bun must be
  // explicitly enabled via --js-runtimes or challenge solving will remain
  // unavailable even when the binaries are installed.
  const jsRuntimes = jsRuntimesEnv
    ? jsRuntimesEnv.split(",").map((value) => value.trim()).filter(Boolean)
    : (process.execPath ? [`bun:${process.execPath}`] : ["bun"]);

  for (const runtime of jsRuntimes) {
    args.push("--js-runtimes", runtime);
  }
  console.log(`[yt-dlp] enabled JS runtimes: ${jsRuntimes.join(", ")}`);

  // Let yt-dlp choose its current default client mix unless we explicitly override it.
  // Forcing `web` was brittle and triggered JS challenge failures on some videos.
  if (playerClients) {
    args.push("--extractor-args", `youtube:player_client=${playerClients}`);
    console.log(`[yt-dlp] using player clients: ${playerClients}`);
  }

  if (proxy) {
    args.push("--proxy", proxy);
    console.log(`[yt-dlp] using proxy: ${proxy}`);
  }

  if (cookiesFile) {
    args.push("--cookies", cookiesFile);
  }

  cachedCommonArgsKey = cacheKey;
  cachedCommonArgs = args;
  return [...args];
}

export interface YouTubeResult {
  videoId: string;
  url: string;
  title: string;
  duration?: number; // seconds
  channel?: string;
  thumbnailUrl?: string;
  viewCount?: number;
  uploadDate?: string;
}

export interface AudioUploadResult {
  url: string;
  sha256: string;
  size: number;
  mimeType: string;
}

/**
 * Search YouTube using yt-dlp's built-in ytsearch feature.
 * Uses --flat-playlist so it's fast (no per-video page fetches).
 */
export async function searchYouTube(query: string, limit = 5): Promise<YouTubeResult[]> {
  const bin = await ensureYtDlp();
  const commonArgs = getCommonYtDlpArgs();
  const proc = Bun.spawn(
    [
      bin,
      "--flat-playlist",
      "--dump-single-json",
      "--no-warnings",
      ...commonArgs,
      `ytsearch${limit}:${query}`,
    ],
    { stdout: "pipe", stderr: "pipe" }
  );

  const [stdout, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    // Show the last meaningful lines — the traceback header is rarely useful
    const lines = stderr.split("\n").filter((l) => l.trim());
    const errorLines = lines.filter((l) => /error|warning|exception|failed/i.test(l));
    const tail = lines.slice(-5);
    const detail = [...new Set([...errorLines, ...tail])].join("\n");
    console.error(`[search] FAILED (exit ${exitCode})\n${stderr}`);
    throw new Error(`yt-dlp search failed (exit ${exitCode}):\n${detail}`);
  }

  let data: any;
  try {
    data = JSON.parse(stdout.trim());
  } catch {
    throw new Error("yt-dlp returned non-JSON output");
  }

  const entries: any[] = data.entries ?? [];

  return entries.map((e) => ({
    videoId: e.id,
    url: e.url?.startsWith("http") ? e.url : `https://www.youtube.com/watch?v=${e.id}`,
    title: e.title ?? "",
    duration: typeof e.duration === "number" ? e.duration : undefined,
    channel: e.channel ?? e.uploader ?? undefined,
    thumbnailUrl: e.thumbnail ?? e.thumbnails?.at(-1)?.url ?? undefined,
    viewCount: typeof e.view_count === "number" ? e.view_count : undefined,
    uploadDate: e.upload_date ?? undefined,
  }));
}

/** Stream a Bun process's stderr line-by-line, logging each line and calling onLine for each. */
async function streamStderr(
  readable: ReadableStream<Uint8Array>,
  prefix: string,
  onLine?: (line: string) => void
): Promise<string> {
  const reader = readable.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    full += chunk;
    buf += chunk;
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) {
        console.log(`${prefix} ${trimmed}`);
        onLine?.(trimmed);
      }
    }
  }
  if (buf.trim()) {
    console.log(`${prefix} ${buf.trim()}`);
    onLine?.(buf.trim());
  }
  return full;
}

export interface PrepareDownloadResult {
  tempId: string;
  sha256: string;
  size: number;
  mimeType: string;
}

// In-memory store of downloaded files awaiting upload. TTL: 15 minutes.
const tempStore = new Map<string, { dir: string; filePath: string; sha256: string; size: number; mimeType: string; expiresAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of tempStore) {
    if (entry.expiresAt < now) {
      try { rmSync(entry.dir, { recursive: true, force: true }); } catch {}
      tempStore.delete(id);
    }
  }
}, 60_000);

export type DownloadFormat = "audio" | "360p" | "480p" | "720p";

interface FormatSpec {
  ext: string;
  mimeType: string;
  ytdlpArgs: string[];
}

// Selects yt-dlp args based on what ffmpeg codecs are actually available.
// Falls back to pre-merged single-stream formats when codecs are missing.
function getFormatSpec(format: DownloadFormat, outTemplate: string, videoUrl: string, caps: FfmpegCaps): FormatSpec {
  const base = ["--no-playlist", "-o", outTemplate, videoUrl];
  switch (format) {
    case "audio":
      if (caps.audio) {
        return {
          ext: "mp3",
          mimeType: "audio/mpeg",
          ytdlpArgs: ["-x", "--audio-format", "mp3", "--audio-quality", "5", ...base],
        };
      }
      // No libmp3lame: native m4a, no postprocessing needed
      return {
        ext: "m4a",
        mimeType: "audio/mp4",
        ytdlpArgs: ["-f", "bestaudio[ext=m4a]/bestaudio", ...base],
      };
    case "360p":
      if (caps.webm) {
        // Only select VP9/webm-native streams — no H.264+AAC fallback into webm container.
        // If no VP9 streams exist, fall back to pre-merged MP4 (no --merge-output-format).
        return {
          ext: "webm", // may actually produce .mp4 if fallback triggers — actualExt handles this
          mimeType: "video/webm",
          ytdlpArgs: ["-f", "bestvideo[height<=360][ext=webm]+bestaudio[ext=webm]/best[height<=360][ext=mp4]/best[height<=360]", ...base],
        };
      }
      return {
        ext: "mp4",
        mimeType: "video/mp4",
        ytdlpArgs: ["-f", "best[height<=360][ext=mp4]/best[height<=360]", ...base],
      };
    case "480p":
      if (caps.webm) {
        return {
          ext: "webm",
          mimeType: "video/webm",
          ytdlpArgs: ["-f", "bestvideo[height<=480][ext=webm]+bestaudio[ext=webm]/best[height<=480][ext=mp4]/best[height<=480]", ...base],
        };
      }
      return {
        ext: "mp4",
        mimeType: "video/mp4",
        ytdlpArgs: ["-f", "best[height<=480][ext=mp4]/best[height<=480]", ...base],
      };
    case "720p":
      if (caps.audio || caps.webm) {
        // MP4 mux: ffmpeg just needs to remux (no encode), any ffmpeg build handles this.
        return {
          ext: "mp4",
          mimeType: "video/mp4",
          ytdlpArgs: ["-f", "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[height<=720]", "--merge-output-format", "mp4", ...base],
        };
      }
      return {
        ext: "mp4",
        mimeType: "video/mp4",
        ytdlpArgs: ["-f", "best[height<=720][ext=mp4]/best[height<=720]", ...base],
      };
  }
}

/**
 * Download a video/audio track via yt-dlp and store it temporarily.
 * Returns a tempId + sha256 so the client can sign the BUD-01 auth event.
 *
 * format:
 *   "audio" → MP3
 *   "360p"  → WebM/VP9 ≤360p (smallest video, ~10–30 MB)
 *   "480p"  → WebM/VP9 ≤480p (~20–60 MB)
 *   "720p"  → MP4/H.264 ≤720p (~80–200 MB)
 */
export async function prepareDownload(
  videoId: string,
  format: DownloadFormat = "audio",
  onProgress?: (message: string) => void
): Promise<PrepareDownloadResult> {
  const tmpDir = `/tmp/wf-ytdlp-${Date.now()}-${videoId}`;
  mkdirSync(tmpDir, { recursive: true });

  try {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const outTemplate = `${tmpDir}/${videoId}.%(ext)s`;

    const caps = await ffmpegCaps();
    const spec = getFormatSpec(format, outTemplate, videoUrl, caps);

    console.log(`[prepare_download] Starting yt-dlp for ${videoId} (format: ${format}, ext: ${spec.ext})`);
    onProgress?.(`Starting download [${spec.mimeType}]: https://www.youtube.com/watch?v=${videoId}`);

    const bin = await ensureYtDlp();
    const commonArgs = getCommonYtDlpArgs();
    const args = [
      bin,
      "--verbose",
      ...commonArgs,
      ...spec.ytdlpArgs,
    ];

    console.log(`[prepare_download] CMD: ${args.join(" ")}`);

    const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });

    // yt-dlp writes everything (progress + errors) to stderr; stdout has the JSON info
    // Collect both in parallel so neither pipe blocks
    const [stderrFull, stdoutFull, exitCode] = await Promise.all([
      streamStderr(proc.stderr, "[yt-dlp]", onProgress),
      new Response(proc.stdout).text(),
      proc.exited,
    ]);

    if (exitCode !== 0) {
      // Extract the most useful lines: ERROR and WARNING lines, plus last 10 lines for context
      const lines = stderrFull.split("\n").filter((l) => l.trim());
      const errorLines = lines.filter((l) => /ERROR|WARNING|Conversion|ffmpeg|PostProcessor/i.test(l));
      const tail = lines.slice(-10);
      const detail = [...new Set([...errorLines, ...tail])].join("\n");
      console.error(`[prepare_download] FAILED (exit ${exitCode})\n--- stderr ---\n${stderrFull}\n--- stdout ---\n${stdoutFull}`);
      rmSync(tmpDir, { recursive: true, force: true });
      throw new Error(`yt-dlp failed (exit ${exitCode}):\n${detail}`);
    }

    // yt-dlp may produce a different extension than expected when falling back between formats.
    // Use readdirSync (reliable in Bun) to find the actual output file.
    const dirFiles = readdirSync(tmpDir);
    console.log(`[prepare_download] Files in tmpDir: ${dirFiles.join(", ") || "(empty)"}`);

    // Find the file yt-dlp produced — skip .part files (incomplete downloads)
    const actualFile = dirFiles.find((f) => f.startsWith(videoId) && !f.endsWith(".part") && !f.endsWith(".ytdl"));
    if (!actualFile) {
      rmSync(tmpDir, { recursive: true, force: true });
      throw new Error(`yt-dlp produced no output file. Dir contents: ${dirFiles.join(", ") || "(empty)"}`);
    }

    const filePath = `${tmpDir}/${actualFile}`;
    const actualExt = actualFile.split(".").pop() ?? spec.ext;
    const actualMime =
      actualExt === "webm" ? "video/webm" :
      actualExt === "mp4"  ? "video/mp4"  :
      actualExt === "mp3"  ? "audio/mpeg" :
      actualExt === "m4a"  ? "audio/mp4"  : "application/octet-stream";

    console.log(`[prepare_download] Output: ${actualFile} (${actualMime})`);

    const file = Bun.file(filePath);

    console.log(`[prepare_download] Reading file for hash...`);
    onProgress?.("Download complete, computing hash...");

    const fileData = new Uint8Array(await file.arrayBuffer());
    const sizeMb = (fileData.length / 1024 / 1024).toFixed(2);
    console.log(`[prepare_download] File size: ${sizeMb} MB`);
    onProgress?.(`Ready to upload: ${sizeMb} MB`);

    const hasher = new Bun.CryptoHasher("sha256");
    hasher.update(fileData);
    const sha256 = hasher.digest("hex");

    const tempId = crypto.randomUUID();
    tempStore.set(tempId, {
      dir: tmpDir,
      filePath,
      sha256,
      size: fileData.length,
      mimeType: actualMime,
      expiresAt: Date.now() + 15 * 60 * 1000,
    });

    console.log(`[prepare_download] Stored as tempId=${tempId}, sha256=${sha256}`);
    return { tempId, sha256, size: fileData.length, mimeType: actualMime };
  } catch (err) {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    throw err;
  }
}

/**
 * Upload a previously prepared file to a Blossom server using a client-signed
 * BUD-01 auth event. The auth event must contain `["x", sha256]` and be signed
 * by the user's Nostr key.
 */
export async function uploadToBlossomWithSignedEvent(
  tempId: string,
  blossomUrl: string,
  signedEventJson: string,
  onProgress?: (message: string) => void
): Promise<AudioUploadResult> {
  const entry = tempStore.get(tempId);
  if (!entry) throw new Error("Temp file not found or expired. Please download again.");

  const file = Bun.file(entry.filePath);
  if (!(await file.exists())) {
    tempStore.delete(tempId);
    throw new Error("Temp file missing. Please download again.");
  }

  const fileData = new Uint8Array(await file.arrayBuffer());
  const uploadUrl = blossomUrl.replace(/\/$/, "") + "/upload";

  console.log(`[upload] Uploading to Blossom: ${uploadUrl} (${(fileData.length / 1024 / 1024).toFixed(2)} MB)`);
  onProgress?.(`Uploading to Blossom: ${uploadUrl}`);

  const authHeader = "Nostr " + Buffer.from(signedEventJson).toString("base64");
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": entry.mimeType,
      "Authorization": authHeader,
    },
    body: fileData,
  });

  // Clean up regardless of outcome
  try { rmSync(entry.dir, { recursive: true, force: true }); } catch {}
  tempStore.delete(tempId);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Blossom upload failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const blob = (await res.json()) as any;
  console.log(`[upload] Upload complete: ${blob.url}`);
  onProgress?.(`Upload complete: ${blob.url}`);

  return {
    url: blob.url,
    sha256: blob.sha256 ?? entry.sha256,
    size: blob.size ?? fileData.length,
    mimeType: entry.mimeType,
  };
}
