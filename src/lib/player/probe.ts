/**
 * Stream liveness probe. Runs a cheap `fetch` with a hard timeout to
 * distinguish "reachable" from "dead 404" streams before we commit the
 * candidate to the audio element.
 *
 * Why probe at all: `audio.play()` against a dead stream can hang for
 * 30+ seconds before emitting an error. Our reconnect loop needs to
 * fail fast to rotate through candidates quickly and surface honest
 * status to the user.
 *
 * Caveats:
 * - CORS on the web means some healthy cross-origin streams will fail
 *   the probe even though the browser's media loader would accept
 *   them. Callers must not treat a failed probe as authoritative —
 *   they should still be willing to fall back to a direct audio
 *   element attempt as a last resort.
 * - Some streams reject Range requests. We send one anyway (most
 *   accept it), and fall through on non-2xx.
 * - Icecast/Shoutcast responses can be weird (`ICY 200 OK` instead of
 *   `HTTP/1.1 200 OK`). Modern fetch implementations normalize this
 *   but we don't rely on response headers beyond `status`.
 */

import { PROBE_TIMEOUT_MS } from "./state";

export type ProbeResult =
  | { ok: true; contentType: string | null; status: number }
  | {
      ok: false;
      reason: "fatal" | "network";
      status?: number;
      message: string;
    };

/**
 * HTTP status codes that mean "this URL is permanently broken for
 * this client". No point retrying.
 */
const FATAL_STATUSES = new Set([
  400, // malformed request — stream URL is probably wrong
  401, // unauthorized
  403, // forbidden
  404, // not found
  405, // method not allowed on this URL
  410, // gone
  415, // unsupported media type
  451, // unavailable for legal reasons
]);

export async function probeStream(
  url: string,
  signal?: AbortSignal
): Promise<ProbeResult> {
  // Compose our own abort controller for the timeout, but also respect
  // an external signal (the supervisor may cancel us if the user hits
  // stop mid-probe).
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  const externalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", externalAbort, { once: true });
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        // Minimize bytes transferred — we only need the status line.
        Range: "bytes=0-1",
        // Shoutcast/Icecast servers send metadata headers when they
        // see this; harmless when they don't support it.
        "Icy-MetaData": "1",
      },
      signal: controller.signal,
      // Don't follow redirects the app can't handle (e.g., to a
      // different protocol). Default is "follow" which is fine for
      // most cases — we keep the default and let fetch handle it.
      redirect: "follow",
      // Don't send cookies. We don't need auth and some streams 403
      // when given session cookies from other origins.
      credentials: "omit",
      cache: "no-store",
    });

    if (response.ok) {
      return {
        ok: true,
        status: response.status,
        contentType: response.headers.get("content-type"),
      };
    }

    if (FATAL_STATUSES.has(response.status)) {
      return {
        ok: false,
        reason: "fatal",
        status: response.status,
        message: `HTTP ${response.status}`,
      };
    }

    // 5xx and anything else — treat as transient network error
    return {
      ok: false,
      reason: "network",
      status: response.status,
      message: `HTTP ${response.status}`,
    };
  } catch (err) {
    // Distinguish our timeout from an external abort. If the external
    // signal aborted, the caller already knows and we shouldn't
    // classify it as a network error.
    if (signal?.aborted) {
      return { ok: false, reason: "network", message: "aborted" };
    }
    if (controller.signal.aborted) {
      return { ok: false, reason: "network", message: "probe timeout" };
    }
    // CORS and DNS failures land here as TypeError. Treat as network —
    // the direct audio element attempt may still work even when fetch
    // can't see the response.
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: "network", message };
  } finally {
    clearTimeout(timeout);
    if (signal) signal.removeEventListener("abort", externalAbort);
  }
}
