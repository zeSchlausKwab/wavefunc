# Native media downloads

The installed Android and desktop apps download YouTube media on the user's
device and upload it directly to the selected Blossom server. On the website,
the song backup link opens `/apps` to help listeners install a native app.
The apps search for YouTube sources from the device.

## Blossom backup

1. The app downloads the selected video ID into a private temporary job
   directory. On Android, yt-dlp selects AAC for audio backups and H.264 with
   AAC up to the selected height for video backups. Android's MediaMuxer
   writes the M4A or MP4 file, combining separate video and audio streams when
   needed.
2. The shared Rust core streams the finished file through SHA-256. The user's
   signer creates a kind 24242 upload authorization scoped to that hash and
   the Blossom server domain.
3. The app streams the file to `PUT /upload` with the signed authorization.
   It attaches the returned URL to the song and cleans up the temporary job.

## Runtime and build requirements

The Android Gradle build uses Chaquopy to package CPython 3.11, yt-dlp and its
matching yt-dlp-ejs release for armeabi-v7a, arm64-v8a and x86_64. The build
machine needs Python 3.11 and the Android NDK. The QuickJS-NG CLI is compiled
from checksum-pinned source and packaged for each ABI. Keep the yt-dlp and
yt-dlp-ejs versions in `app/android/app/build.gradle.kts` in sync with the
dependencies in yt-dlp's release metadata.

The desktop Rust backend resolves a local yt-dlp executable. Set
`WAVEFUNC_YTDLP_PATH` for a nonstandard installation, or `WAVEFUNC_DENO_PATH`
to specify a Deno runtime. Desktop formats that combine adaptive streams
require ffmpeg.
