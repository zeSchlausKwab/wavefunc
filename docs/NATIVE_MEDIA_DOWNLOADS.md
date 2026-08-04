# Native media downloads

WaveFunc acquires YouTube media only in installed Android and desktop apps. The
website keeps search and preview support, but directs users to `/apps` for a
reliable local download.

## Flow

1. The native engine validates the video ID and downloads on the user's device.
   The app assigns the job ID up front and polls queryable native job state, so a
   completed download can be recovered if Android backgrounds the WebView and
   drops the original command response.
2. It streams the file through SHA-256 without loading the full file into memory.
3. The user's signer creates a short-lived Blossom BUD-11 authorization scoped
   to the exact hash and lowercase Blossom domain. The UI shows this as a
   separate approval phase and fails with an actionable error after 90 seconds
   instead of leaving stale download output on screen indefinitely.
4. The native engine streams the file to `PUT /upload` with `X-SHA-256` and a
   Base64url (unpadded) Nostr authorization header.
5. Temporary files are removed after success, error, cancellation, or the
   Android foreground-service timeout.

The Android transfer service remains in the foreground across download,
external signing, and upload so the WebView may be backgrounded safely.

## Release inputs

Desktop release jobs download and bundle the current official `yt-dlp` binary
and Deno 2.8.1. Deno is passed explicitly as yt-dlp's JavaScript challenge
runtime. Development builds may set `WAVEFUNC_YTDLP_PATH` and
`WAVEFUNC_DENO_PATH`.

Android uses `io.github.junkfood02.youtubedl-android` 0.18.1, which embeds
yt-dlp, Python, QuickJS, and ffmpeg.

## Android licensing release gate

`youtubedl-android` is GPL-3.0 licensed. Before publishing an APK containing
this dependency, confirm the distribution approach, notices, corresponding
source availability, and compatibility with WaveFunc's current MIT licensing.
This implementation is suitable for development testing, but Android release
must not be treated as license-cleared merely because it builds successfully.
