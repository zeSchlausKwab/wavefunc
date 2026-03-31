import { mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { finalizeEvent } from "nostr-tools";

// ─── yt-dlp binary resolution ─────────────────────────────────────────────────
// Place the binary at contextvm/bin/yt-dlp (or set YTDLP_PATH).
// Download it from https://github.com/yt-dlp/yt-dlp/releases/latest
//   macOS:  curl -L .../yt-dlp_macos -o contextvm/bin/yt-dlp && chmod +x contextvm/bin/yt-dlp
//   Linux:  curl -L .../yt-dlp       -o contextvm/bin/yt-dlp && chmod +x contextvm/bin/yt-dlp

const LOCAL_BIN = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "yt-dlp");

let resolvedBin: string | null = null;

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
  const proc = Bun.spawn(
    [
      bin,
      "--flat-playlist",
      "--dump-single-json",
      "--no-warnings",
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
    throw new Error(`yt-dlp search failed (exit ${exitCode}): ${stderr.slice(0, 400)}`);
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

/**
 * Download a video/audio track via yt-dlp, then upload to a Blossom server
 * using BUD-01 auth signed by the server's private key.
 *
 * format: "audio" → MP3 (default), "video" → MP4 (best quality up to 720p).
 * onProgress is called with each log line so the MCP layer can forward it as
 * a progress notification (which also resets the request timeout).
 */
export async function downloadAndUploadAudio(
  videoId: string,
  blossomServer: string,
  serverPrivKeyHex: string,
  onProgress?: (message: string) => void,
  format: "audio" | "video" = "audio"
): Promise<AudioUploadResult> {
  const tmpDir = `/tmp/wf-ytdlp-${Date.now()}-${videoId}`;
  mkdirSync(tmpDir, { recursive: true });

  const isVideo = format === "video";
  const ext = isVideo ? "mp4" : "mp3";
  const mimeType = isVideo ? "video/mp4" : "audio/mpeg";
  const contentType = isVideo ? "video/mp4" : "audio/mpeg";

  try {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const outTemplate = `${tmpDir}/${videoId}.%(ext)s`;

    console.log(`[download] Starting yt-dlp for ${videoId} (format: ${format})`);
    onProgress?.(`Starting ${format} download: https://www.youtube.com/watch?v=${videoId}`);

    const bin = await ensureYtDlp();

    const args = isVideo
      ? [
          bin,
          "-f", "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[height<=720]",
          "--merge-output-format", "mp4",
          "--no-playlist",
          "-o", outTemplate,
          videoUrl,
        ]
      : [
          bin,
          "-x",
          "--audio-format", "mp3",
          "--audio-quality", "5",
          "--no-playlist",
          "-o", outTemplate,
          videoUrl,
        ];

    const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });

    // Stream stderr in real-time — each line resets the MCP timeout via onProgress
    const [stderrFull, exitCode] = await Promise.all([
      streamStderr(proc.stderr, "[yt-dlp]", onProgress),
      proc.exited,
    ]);

    if (exitCode !== 0) {
      throw new Error(`yt-dlp download failed (exit ${exitCode}): ${stderrFull.slice(0, 400)}`);
    }

    const filePath = `${tmpDir}/${videoId}.${ext}`;
    const file = Bun.file(filePath);

    if (!(await file.exists())) {
      throw new Error(`Downloaded file not found at ${filePath}`);
    }

    console.log(`[download] Download complete, reading file...`);
    onProgress?.("Download complete, preparing upload...");

    const fileData = new Uint8Array(await file.arrayBuffer());
    const sizeMb = (fileData.length / 1024 / 1024).toFixed(2);
    console.log(`[download] File size: ${sizeMb} MB`);
    onProgress?.(`File size: ${sizeMb} MB`);

    // SHA-256 hash (required by BUD-01)
    const hasher = new Bun.CryptoHasher("sha256");
    hasher.update(fileData);
    const sha256 = hasher.digest("hex");

    // Build BUD-01 kind 24242 auth event signed with server key
    const privKeyBytes = Uint8Array.from(Buffer.from(serverPrivKeyHex.padStart(64, "0"), "hex"));
    const now = Math.floor(Date.now() / 1000);
    const authEvent = finalizeEvent(
      {
        kind: 24242,
        created_at: now,
        content: `Upload ${format}`,
        tags: [
          ["t", "upload"],
          ["x", sha256],
          ["expiration", String(now + 600)],
        ],
      },
      privKeyBytes
    );

    const uploadUrl = blossomServer.replace(/\/$/, "") + "/upload";
    console.log(`[download] Uploading to Blossom: ${uploadUrl}`);
    onProgress?.(`Uploading to Blossom: ${uploadUrl}`);

    const authHeader = "Nostr " + Buffer.from(JSON.stringify(authEvent)).toString("base64");
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
        "Authorization": authHeader,
      },
      body: fileData,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Blossom upload failed (${res.status}): ${body.slice(0, 300)}`);
    }

    const blob = (await res.json()) as any;
    console.log(`[download] Upload complete: ${blob.url}`);
    onProgress?.(`Upload complete: ${blob.url}`);

    return {
      url: blob.url,
      sha256: blob.sha256 ?? sha256,
      size: blob.size ?? fileData.length,
      mimeType,
    };
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup
    }
  }
}
