import { isNativeApp } from "./platform";

/**
 * Fetch an untrusted public HTTPS endpoint using the correct platform stack.
 * Native WebViews still enforce browser CORS; Tauri's scoped Rust client does
 * not, which is required for LNURL services that omit WebView CORS headers.
 */
export async function platformFetch(
  input: string | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = new URL(input.toString());
  if (url.protocol !== "https:") {
    throw new Error("Only secure HTTPS requests are allowed");
  }

  if (isNativeApp()) {
    const { fetch: nativeFetch } = await import("@tauri-apps/plugin-http");
    return nativeFetch(url, init);
  }

  return fetch(url, init);
}
