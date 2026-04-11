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

export interface ShareInput {
  url: string;
  title?: string;
  text?: string;
}

export async function shareOrCopy(input: ShareInput): Promise<ShareResult> {
  // navigator.share requires a user gesture. Callers MUST invoke this
  // from a click handler, not from a useEffect or async-after-delay
  // path, or the browser will reject the call.
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function"
  ) {
    try {
      await navigator.share({
        url: input.url,
        title: input.title,
        text: input.text,
      });
      return "shared";
    } catch (err) {
      // User cancel throws AbortError — treat as success from our
      // perspective. Any other error falls through to clipboard.
      if (err instanceof Error && err.name === "AbortError") {
        return "shared";
      }
      // fall through to clipboard
    }
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
