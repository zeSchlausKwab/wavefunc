import { parseIcyResponse } from "@music-metadata/icy";

type NowPlaying = {
  url: string;
  source: 'ICY' | 'HLS-ID3' | 'PLAYLIST' | 'UNKNOWN';
  station?: string;
  artist?: string;
  title?: string;
  raw?: Record<string, unknown>;
  notes?: string;
};

const CONNECT_TIMEOUT_MS = 12_000;
const READ_BYTE_LIMIT = 2_000_000; // 2 MB cap per fetch to avoid huge reads
const HLS_SEGMENT_READ_LIMIT = 512_000; // 512 KB is usually enough to hit an ID3 tag

// --- utils ---------------------------------------------

function timeoutSignal(ms: number): AbortSignal {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(new Error('timeout')), ms);
  // @ts-ignore
  ctrl.signal.addEventListener?.('abort', () => clearTimeout(id));
  return ctrl.signal;
}

function isLikelyPlaylistUrl(u: string) {
  return /\.(m3u8|m3u|pls)$/i.test(new URL(u).pathname);
}

function looksLikeHls(contentType?: string | null, url?: string) {
  return (
    (contentType && /application\/(vnd\.apple\.mpegurl|x-mpegurl)/i.test(contentType)) ||
    (url && /\.m3u8($|\?)/i.test(url))
  );
}

function looksLikeIcy(headers: Headers) {
  // Check for icy-metaint header
  if (headers.has('icy-metaint')) return true;
  
  // Check for any icy- prefixed headers
  let hasIcyHeader = false;
  headers.forEach((value, key) => {
    if (key.toLowerCase().startsWith('icy-')) {
      hasIcyHeader = true;
    }
  });
  if (hasIcyHeader) return true;
  
  // Check server header for icecast/shoutcast
  return /icecast|shoutcast/i.test(headers.get('server') ?? '');
}

function latin1Decode(buf: Uint8Array) {
  // latin1 a.k.a. ISO-8859-1 is what ICY metadata uses
  return new TextDecoder('latin1').decode(buf);
}

function parseStreamTitle(s: string | undefined) {
  // ICY StreamTitle often looks like: "Artist - Title"
  if (!s) return { artist: undefined, title: undefined };
  const cleaned = s.replace(/^'+|'+$/g, '').trim();
  const parts = cleaned.split(' - ');
  if (parts.length >= 2) {
    const artist = parts.shift()?.trim();
    const title = parts.join(' - ').trim();
    return { artist, title };
  }
  return { artist: undefined, title: cleaned || undefined };
}

async function readSome(reader: ReadableStreamDefaultReader<Uint8Array>, needed: number): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < needed) {
    const { value, done } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

async function readUpToLimit(resp: Response, limit: number): Promise<Uint8Array> {
  const reader = resp.body!.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < limit) {
    const { value, done } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

function syncsafeToSize(b: Uint8Array, offset: number) {
  // ID3 syncsafe 4 bytes
  if (offset + 3 >= b.length) return 0;
  return ((b[offset]! & 0x7f) << 21) | ((b[offset + 1]! & 0x7f) << 14) | ((b[offset + 2]! & 0x7f) << 7) | (b[offset + 3]! & 0x7f);
}

function readTextWithEncoding(buf: Uint8Array, offset: number, len: number): string {
  const encMarker = buf[offset]; // 0=latin1, 1=utf16, 2=utf16be, 3=utf8
  const data = buf.subarray(offset + 1, offset + len);
  try {
    if (encMarker === 0) return new TextDecoder('latin1').decode(data).replace(/\0+$/g, '').trim();
    if (encMarker === 3) return new TextDecoder('utf-8').decode(data).replace(/\0+$/g, '').trim();
    // UTF-16 with BOM
    if (encMarker === 1) return new TextDecoder('utf-16').decode(data).replace(/\0+$/g, '').trim();
    // Fallback
    return new TextDecoder().decode(data).replace(/\0+$/g, '').trim();
  } catch {
    return new TextDecoder().decode(data).replace(/\0+$/g, '').trim();
  }
}

// --- playlist resolvers --------------------------------

async function resolvePlaylist(url: string): Promise<string | null> {
  // supports simple .m3u/.m3u8/.pls text playlists: pick first valid http(s) media URL
  const resp = await fetch(url, { redirect: 'follow', signal: timeoutSignal(CONNECT_TIMEOUT_MS) });
  if (!resp.ok) throw new Error(`Playlist fetch ${resp.status}`);
  const contentType = resp.headers.get('content-type') ?? '';
  const text = await resp.text();

  // PLS: look for File1=...
  if (/pls/i.test(contentType) || /\[playlist\]/i.test(text)) {
    const m = text.match(/^\s*File1\s*=\s*(.+)\s*$/im);
    if (m && m[1]) return m[1].trim();
  }

  // M3U/M3U8: take first non-comment URL
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.startsWith('#')) continue;
    if (/^https?:\/\//i.test(line)) return new URL(line, url).toString();
  }

  // Some servers return a variant playlist that references another .m3u8
  const nested = lines.find((l) => /\.m3u8($|\?)/i.test(l));
  if (nested) return new URL(nested, url).toString();

  return null;
}

// For HLS master -> pick a media playlist (first), for media playlist -> pick first segment URL
async function resolveHlsFirstMediaOrSegment(url: string): Promise<{ mediaPlaylistUrl?: string; segmentUrl?: string } | null> {
  const resp = await fetch(url, { redirect: 'follow', signal: timeoutSignal(CONNECT_TIMEOUT_MS) });
  if (!resp.ok) throw new Error(`HLS fetch ${resp.status}`);
  const body = await resp.text();
  const base = new URL(resp.url);

  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const m3u8Refs = lines.filter((l) => !l.startsWith('#') && /\.m3u8($|\?)/i.test(l));
  if (m3u8Refs.length && m3u8Refs[0]) {
    const mediaPlaylistUrl = new URL(m3u8Refs[0], base).toString();
    return { mediaPlaylistUrl };
  }

  // we might already be at a media playlist, pick first segment
  const seg = lines.find((l) => !l.startsWith('#') && /^https?:\/\//i.test(l));
  if (seg) return { segmentUrl: seg };

  // or relative segment
  const rel = lines.find((l) => !l.startsWith('#') && !l.includes('://') && l.length > 0);
  if (rel) return { segmentUrl: new URL(rel, base).toString() };

  return null;
}

// --- ICY (Shoutcast/Icecast) ----------------------------

async function probeIcy(url: string, hintHeaders?: Headers): Promise<NowPlaying | null> {
  // Request with Icy-MetaData:1 to get metadata blocks
  const resp = await fetch(url, {
    method: 'GET',
    redirect: 'follow',
    headers: { 'Icy-MetaData': '1', 'User-Agent': 'now-playing-probe/1.0' },
    signal: timeoutSignal(CONNECT_TIMEOUT_MS),
  });

  if (!resp.ok || !resp.body) return null;

  const headers = resp.headers;
  const metaIntStr = headers.get('icy-metaint');
  const metaInt = metaIntStr ? parseInt(metaIntStr, 10) : NaN;
  if (!Number.isFinite(metaInt) || metaInt <= 0) {
    // Some servers only advertise ICY on 200 OK but won't send metadata – bail
    return null;
  }

  const station = headers.get('icy-name') ?? hintHeaders?.get('icy-name') ?? undefined;

  // Use music-metadata-icy for robust parsing
  return new Promise<NowPlaying | null>((resolve) => {
    const timeout = setTimeout(() => {
      resolve({
        url: resp.url,
        source: 'ICY',
        station,
        notes: 'Timeout waiting for ICY metadata',
      });
    }, 10000); // 10 second timeout

    let resolved = false;

    try {
      // Parse ICY response using the library
      const cleanStream = parseIcyResponse(resp, ({ metadata: icyMeta }) => {
        if (resolved) return;

        // Extract song info
        const streamTitle = icyMeta.StreamTitle;
        if (streamTitle) {
          resolved = true;
          clearTimeout(timeout);

          const { artist, title } = parseStreamTitle(streamTitle);

          // Cancel the stream
          cleanStream.cancel().catch(() => {});

          resolve({
            url: resp.url,
            source: 'ICY',
            station: station || icyMeta.icyName,
            artist,
            title,
            raw: {
              StreamTitle: streamTitle,
              StreamUrl: icyMeta.StreamUrl,
              icyName: icyMeta.icyName,
              icyGenre: icyMeta.icyGenre,
            },
          });
          return;
        }

        // If we get metadata but no StreamTitle, we can still resolve with station info
        if (icyMeta.icyName || station) {
          resolved = true;
          clearTimeout(timeout);

          cleanStream.cancel().catch(() => {});

          resolve({
            url: resp.url,
            source: 'ICY',
            station: station || icyMeta.icyName,
            notes: 'ICY metadata present but no current song info',
            raw: {
              icyName: icyMeta.icyName,
              icyGenre: icyMeta.icyGenre,
            },
          });
        }
      });

      // Start consuming the stream to trigger metadata callbacks
      const reader = cleanStream.getReader();

      const consumeStream = async () => {
        try {
          while (!resolved) {
            const { done } = await reader.read();
            if (done) break;
          }

          // If we exit without resolving, provide fallback
          if (!resolved) {
            clearTimeout(timeout);
            resolve({
              url: resp.url,
              source: 'ICY',
              station,
              notes: 'Stream ended before receiving metadata',
            });
          }
        } catch (error) {
          if (!resolved) {
            clearTimeout(timeout);
            resolve(null);
          }
        }
      };

      consumeStream();

    } catch (error) {
      clearTimeout(timeout);
      resolve(null);
    }
  });
}

// --- HLS ID3 (TIT2/TPE1) --------------------------------

function parseId3FromBuffer(buf: Uint8Array): { title?: string; artist?: string; rawFrames?: Record<string, string> } | null {
  // Look for 'ID3' marker near the start (HLS timed metadata often begins at segment start)
  let pos = buf.indexOf(0x49); // 'I'
  while (pos !== -1 && pos + 9 < buf.length) {
    if (buf[pos] === 0x49 && buf[pos + 1] === 0x44 && buf[pos + 2] === 0x33) {
      const ver = buf[pos + 3]; // 3 or 4
      if (ver !== 3 && ver !== 4) {
        pos = buf.indexOf(0x49, pos + 1);
        continue;
      }
      const size = syncsafeToSize(buf, pos + 6);
      const end = Math.min(buf.length, pos + 10 + size);
      let off = pos + 10;
      const frames: Record<string, string> = {};
      while (off + 10 <= end) {
        const id = new TextDecoder('ascii').decode(buf.subarray(off, off + 4));
        const fSize = ver === 4
          ? syncsafeToSize(buf, off + 4)
          : (off + 7 < buf.length ? ((buf[off + 4]! << 24) | (buf[off + 5]! << 16) | (buf[off + 6]! << 8) | buf[off + 7]!) >>> 0 : 0);
        const flags = (off + 9 < buf.length ? (buf[off + 8]! << 8) | buf[off + 9]! : 0);
        if (!id.trim() || fSize <= 0) break;
        const dataStart = off + 10;
        const dataEnd = Math.min(dataStart + fSize, end);
        if (id.startsWith('T')) {
          // text frame; first byte is encoding
          frames[id] = readTextWithEncoding(buf, dataStart, dataEnd - dataStart);
        }
        // advance
        off = dataEnd;
        // basic guard to avoid infinite loops on corrupt data
        if (off <= dataStart) break;
      }
      return {
        title: frames['TIT2'],
        artist: frames['TPE1'],
        rawFrames: frames,
      };
    }
    pos = buf.indexOf(0x49, pos + 1);
  }
  return null;
}

async function probeHls(url: string): Promise<NowPlaying | null> {
  // Resolve to media playlist or directly to a media segment
  const first = await resolveHlsFirstMediaOrSegment(url);
  if (!first) return null;

  if (first.mediaPlaylistUrl) {
    const segRef = await resolveHlsFirstMediaOrSegment(first.mediaPlaylistUrl);
    if (!segRef?.segmentUrl) {
      return {
        url,
        source: 'PLAYLIST',
        notes: 'HLS playlist found but no segment discovered',
      };
    }
    return await probeHlsSegment(segRef.segmentUrl);
  }

  if (first.segmentUrl) {
    return await probeHlsSegment(first.segmentUrl);
  }

  return null;
}

async function probeHlsSegment(segmentUrl: string): Promise<NowPlaying | null> {
  const resp = await fetch(segmentUrl, {
    redirect: 'follow',
    // read only early bytes
    headers: { Range: `bytes=0-${HLS_SEGMENT_READ_LIMIT - 1}` },
    signal: timeoutSignal(CONNECT_TIMEOUT_MS),
  });
  if (!resp.ok || !resp.body) {
    return {
      url: segmentUrl,
      source: 'UNKNOWN',
      notes: `Failed to fetch segment: ${resp.status}`,
    };
  }
  const buf = await readUpToLimit(resp, HLS_SEGMENT_READ_LIMIT);
  const id3 = parseId3FromBuffer(buf);
  if (!id3) {
    return {
      url: segmentUrl,
      source: 'HLS-ID3',
      notes: 'No ID3 timed metadata found in first segment',
    };
  }
  return {
    url: segmentUrl,
    source: 'HLS-ID3',
    artist: id3.artist,
    title: id3.title,
    raw: id3.rawFrames,
  };
}

// --- main probe -----------------------------------------

export async function probeStream(inputUrl: string): Promise<NowPlaying> {
  let url = inputUrl;

  // Fast path for obvious playlists
  if (isLikelyPlaylistUrl(url)) {
    const resolved = await resolvePlaylist(url).catch(() => null);
    if (resolved) url = resolved;
  }

  // HEAD/GET to learn content-type and whether ICY is supported
  let resp = await fetch(url, {
    method: 'GET',
    redirect: 'follow',
    headers: { 'Icy-MetaData': '1', 'User-Agent': 'now-playing-probe/1.0' },
    signal: timeoutSignal(CONNECT_TIMEOUT_MS),
  });

  // Some servers reject with 403 on Icy header; retry without it
  if (!resp.ok || !resp.body) {
    resp = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: timeoutSignal(CONNECT_TIMEOUT_MS),
    });
  }

  const contentType = resp.headers.get('content-type') ?? '';
  const finalUrl = resp.url;

  // If it looks like HLS (.m3u8), handle HLS
  if (looksLikeHls(contentType, finalUrl)) {
    try {
      // close current stream before probing HLS
      resp.body?.cancel().catch(() => {});
      const hls = await probeHls(finalUrl);
      if (hls) return hls;
    } catch (e) {
      // fall through to ICY attempt
    }
  }

  // If ICY-esque, do ICY probe (use a separate fetch to control reading)
  if (looksLikeIcy(resp.headers) || /audio\/(mpeg|aac|aacp)/i.test(contentType)) {
    resp.body?.cancel().catch(() => {});
    const icy = await probeIcy(finalUrl, resp.headers).catch(() => null);
    if (icy) return icy;
  }

  // If initial URL was a playlist (non-HLS), try resolving once
  if (isLikelyPlaylistUrl(finalUrl)) {
    const resolved = await resolvePlaylist(finalUrl).catch(() => null);
    if (resolved && resolved !== finalUrl) {
      const nested = await probeStream(resolved);
      return { ...nested, notes: [nested.notes, `Resolved from ${finalUrl}`].filter(Boolean).join(' | ') };
    }
  }

  // Unknown / fallback: return minimal info
  resp.body?.cancel().catch(() => {});
  return {
    url: finalUrl,
    source: 'UNKNOWN',
    notes: `Unrecognized stream type (content-type: ${contentType || 'n/a'})`,
  };
}