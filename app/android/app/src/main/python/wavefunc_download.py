"""Download YouTube tracks for the Android MP4 muxer."""

import os
from pathlib import Path


def select_tracks(formats, target):
    # yt-dlp orders these from worst to best. Prefer AVC and AAC because the
    # platform MP4 muxer supports them on every Android version we ship.
    usable = [f for f in reversed(formats) if not f.get("has_drm")]
    audio = next((f for f in usable if f.get("vcodec") == "none"
                  and (f.get("acodec") or "").startswith("mp4a")), None)
    if target == "audio":
        if audio:
            return [audio]
        return [f for f in usable if (f.get("acodec") or "").startswith("mp4a")][:1]

    height = {"360p": 360, "480p": 480, "720p": 720}[target]
    videos = [f for f in usable if (f.get("vcodec") or "").startswith("avc")
              and 0 < (f.get("height") or 0) <= height]
    # Prefer a combined file at equal resolution, but allow two adaptive
    # streams so requesting 720p doesn't needlessly return 360p.
    videos.sort(key=lambda f: (f["height"], (f.get("acodec") or "").startswith("mp4a")),
                reverse=True)
    for video in videos:
        if (video.get("acodec") or "").startswith("mp4a"):
            return [video]
        if video.get("acodec") == "none" and audio:
            return [video, audio]
    return []


def download(video_id, target, directory, quickjs):
    from yt_dlp import YoutubeDL

    if not os.access(quickjs, os.X_OK):
        raise RuntimeError("The bundled QuickJS runtime is unavailable.")
    paths = []
    opts = {
        "format": lambda ctx: select_tracks(ctx["formats"], target),
        "outtmpl": str(Path(directory) / "source-%(format_id)s.%(ext)s"),
        "restrictfilenames": True,
        "js_runtimes": {"quickjs": {"path": quickjs}},
        "noplaylist": True,
        "quiet": True,
        "noprogress": True,
        "fixup": "never",  # Android's MediaMuxer writes the final container.
        "socket_timeout": 30,
        "post_hooks": [paths.append],
    }
    with YoutubeDL(opts) as ydl:
        ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=True)
    return paths
