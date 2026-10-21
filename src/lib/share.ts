/**
 * Cross-platform share helper.
 *
 * Tries the Web Share API first, which pops the OS-native share sheet
 * on Android / iOS / Safari macOS. Falls back to clipboard copy on
 * desktop browsers that don't support navigator.share.
 *
 * The Web Share API is only available in secure contexts (HTTPS or
 * localhost) and on browsers that implement it. Android WebView has
 * it since API 28. Chromium desktop has it since 89.
 *
 * Return value:
 * - "shared"  — the share sheet was shown (may have been cancelled by
 *               the user — we can't distinguish, and don't need to)
 * - "copied"  — clipboard fallback was used successfully
 * - "failed"  — neither path worked (no clipboard + no share API)
 */

export type ShareResult = "shared" | "copied" | "failed";
export type NativeShareResult =
  | "shared"
  | "cancelled"
  | "unavailable"
  | "failed";

export interface ShareInput {
  url: string;
  title?: string;
  text?: string;
}

/**
 * Some Android share targets concatenate separate Web Share `url` and `text`
 * fields in the wrong order, turning trailing prose into part of the link.
 * Keeping one text field with the URL last is portable and unambiguous.
 */
export function buildNativeShareData(input: ShareInput): ShareData {
  return {
    ...(input.title ? { title: input.title } : {}),
    text: [input.text?.trim(), input.url].filter(Boolean).join("\n"),
  };
}

export function canShareViaDevice(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function"
  );
}

/**
 * Invoke only the OS share sheet. Unlike shareOrCopy, this never changes the
 * user's requested action into a clipboard copy when sharing is unavailable.
 */
export async function shareViaDevice(
  input: ShareInput,
): Promise<NativeShareResult> {
  if (!canShareViaDevice()) return "unavailable";

  try {
    await navigator.share(buildNativeShareData(input));
    return "shared";
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      error.name === "AbortError"
    ) {
      return "cancelled";
    }
    return "failed";
  }
}

/** Recover a NIP-19/id route value when a share target appended prose to it. */
export function normalizeStationRouteParam(value: string): string {
  let decoded = value.trim();
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // A malformed percent escape should still reach the normal not-found path.
  }
  return decoded.split(/\s+/u)[0] ?? decoded;
}

export async function shareOrCopy(input: ShareInput): Promise<ShareResult> {
  // navigator.share requires a user gesture. Callers MUST invoke this
  // from a click handler, not from a useEffect or async-after-delay
  // path, or the browser will reject the call.
  if (canShareViaDevice()) {
    const result = await shareViaDevice(input);
    if (result === "shared" || result === "cancelled") {
      return "shared";
    }
    // A native failure preserves this legacy helper's clipboard fallback.
  }

  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
  ) {
    try {
      await navigator.clipboard.writeText(input.url);
      return "copied";
    } catch {
      return "failed";
    }
  }

  return "failed";
}
