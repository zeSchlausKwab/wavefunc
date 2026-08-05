export type StreamProbeResult = {
  reachable: boolean;
  latencyMs: number;
  streamUrl: string;
  resolvedUrl?: string;
  contentType?: string;
  statusCode?: number;
  insecure: boolean;
  permanentRedirect: boolean;
  error?: string;
};

const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);
const PERMANENT_REDIRECT_CODES = new Set([301, 308]);

export async function probeStreamHealth(
  streamUrl: string,
  timeoutMs = 12_000,
): Promise<StreamProbeResult> {
  const startedAt = performance.now();
  let currentUrl = streamUrl;
  let permanentRedirect = false;

  try {
    for (let redirects = 0; redirects <= 5; redirects += 1) {
      const response = await fetch(currentUrl, {
        method: "GET",
        redirect: "manual",
        headers: {
          Accept: "audio/*,application/vnd.apple.mpegurl,application/x-mpegURL,*/*;q=0.1",
          Range: "bytes=0-1023",
          "Icy-MetaData": "1",
          "User-Agent": "WaveFunc-Observer/1.0",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (REDIRECT_CODES.has(response.status)) {
        const location = response.headers.get("location");
        if (!location) throw new Error(`Redirect ${response.status} without Location`);
        permanentRedirect ||= PERMANENT_REDIRECT_CODES.has(response.status);
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      const reachable = response.ok || response.status === 206;
      if (reachable && response.body) {
        const reader = response.body.getReader();
        await reader.read();
        await reader.cancel().catch(() => undefined);
      }

      return {
        reachable,
        latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
        streamUrl,
        resolvedUrl: currentUrl,
        contentType: response.headers.get("content-type") ?? undefined,
        statusCode: response.status,
        insecure: new URL(streamUrl).protocol === "http:",
        permanentRedirect,
        ...(!reachable ? { error: `HTTP ${response.status}` } : {}),
      };
    }

    throw new Error("Too many redirects");
  } catch (error) {
    return {
      reachable: false,
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      streamUrl,
      resolvedUrl: currentUrl,
      insecure: (() => {
        try {
          return new URL(streamUrl).protocol === "http:";
        } catch {
          return false;
        }
      })(),
      permanentRedirect,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
