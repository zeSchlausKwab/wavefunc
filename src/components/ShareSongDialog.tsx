import { useEffect, useMemo, useState } from "react";
import { useNDK } from "@nostr-dev-kit/react";
import { NDKEvent } from "@nostr-dev-kit/ndk";
import type { NDKSong } from "../lib/NDKSong";
import { cn } from "@/lib/utils";

interface ShareSongDialogProps {
  song: NDKSong;
  onClose: () => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function Toggle({ label, enabled, onChange }: { label: string; enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className={cn(
        "text-[9px] font-black uppercase tracking-widest px-2 py-0.5 border transition-colors",
        enabled
          ? "border-on-background bg-on-background text-surface"
          : "border-on-background/20 hover:border-on-background/60"
      )}
    >
      {label}
    </button>
  );
}

export function ShareSongDialog({ song, onClose }: ShareSongDialogProps) {
  const { ndk } = useNDK();

  // Collect all audio URLs from `r` tags
  const audioUrls = useMemo(
    () => song.getMatchingTags("r").map((t) => t[1]).filter(Boolean),
    [song]
  );

  const [selectedUrl, setSelectedUrl] = useState<string | null>(audioUrls[0] ?? null);
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [includeWavefuncRef, setIncludeWavefuncRef] = useState(true);
  const [tagWavefunc, setTagWavefunc] = useState(true);
  const [tagSongstr, setTagSongstr] = useState(true);
  const [tagTunestr, setTagTunestr] = useState(true);

  const [content, setContent] = useState("");
  const [isEdited, setIsEdited] = useState(false);
  const [phase, setPhase] = useState<"compose" | "publishing" | "done" | "error">("compose");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const autoContent = useMemo(() => {
    const parts: string[] = [];

    if (includeMetadata) {
      const title = song.title ? `"${song.title}"` : null;
      const artist = song.artist ? `by ${song.artist}` : null;
      let meta = [title, artist].filter(Boolean).join(" ");
      if (song.album) meta += ` · ${song.album}`;
      if (song.releaseYear) meta += ` (${song.releaseYear})`;
      if (song.duration) meta += ` [${formatDuration(song.duration)}]`;
      if (meta) parts.push(`🎵 ${meta}`);
    }

    if (selectedUrl) parts.push(selectedUrl);

    if (includeWavefuncRef) parts.push("Found via wavefunc.live — internet radio on nostr");

    const hashtags = [
      tagWavefunc && "#wavefunc",
      tagSongstr && "#songstr",
      tagTunestr && "#tunestr",
    ]
      .filter(Boolean)
      .join(" ");
    if (hashtags) parts.push(hashtags);

    return parts.join("\n\n");
  }, [includeMetadata, includeWavefuncRef, tagWavefunc, tagSongstr, tagTunestr, selectedUrl, song]);

  // Keep textarea in sync with auto-content when not manually edited
  useEffect(() => {
    if (!isEdited) setContent(autoContent);
  }, [autoContent, isEdited]);

  const handleTextChange = (val: string) => {
    setContent(val);
    setIsEdited(true);
  };

  const handleReset = () => {
    setContent(autoContent);
    setIsEdited(false);
  };

  const handlePublish = async () => {
    if (!ndk?.signer) {
      setErrorMsg("No signer — connect your account first");
      setPhase("error");
      return;
    }
    setPhase("publishing");
    try {
      const event = new NDKEvent(ndk);
      event.kind = 1;
      event.content = content;
      event.created_at = Math.floor(Date.now() / 1000);

      if (tagWavefunc) event.tags.push(["t", "wavefunc"]);
      if (tagSongstr) event.tags.push(["t", "songstr"]);
      if (tagTunestr) event.tags.push(["t", "tunestr"]);
      if (selectedUrl) event.tags.push(["r", selectedUrl]);
      if (song.songId) event.tags.push(["a", song.address]);

      await event.sign();
      const relays = await event.publish();
      if (relays.size === 0) throw new Error("Published to 0 relays");
      setPhase("done");
    } catch (err: any) {
      setErrorMsg(err.message ?? "Publish failed");
      setPhase("error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-lg border-4 border-on-background bg-background shadow-[8px_8px_0px_0px_rgba(29,28,19,1)]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-on-background text-surface">
          <span className="text-[11px] font-black uppercase tracking-widest flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[14px]">share</span>
            SHARE_NOTE
          </span>
          <button onClick={onClose} className="text-surface/50 hover:text-surface transition-colors">
            <span className="material-symbols-outlined text-[14px]">close</span>
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Song summary */}
          <div className="flex items-center gap-2.5">
            {song.thumb && (
              <img
                src={song.thumb}
                alt=""
                className="w-10 h-10 shrink-0 object-cover bg-on-background/10"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
            )}
            <div className="min-w-0">
              <p className="font-black text-[13px] uppercase tracking-tighter truncate leading-tight">
                {song.title || "UNKNOWN_TRACK"}
              </p>
              <p className="text-[10px] text-on-background/55 truncate">
                {song.artist || "Unknown Artist"}
                {song.album && <span className="opacity-70"> · {song.album}</span>}
              </p>
            </div>
          </div>

          {/* File picker — only shown when multiple URLs */}
          {audioUrls.length > 1 && (
            <div className="space-y-1.5">
              <span className="text-[9px] font-bold uppercase tracking-widest text-on-background/40">FILE:</span>
              <div className="flex flex-wrap gap-1.5">
                {audioUrls.map((url) => {
                  const filename = url.split("/").pop()?.slice(0, 32) ?? url.slice(0, 32);
                  return (
                    <button
                      key={url}
                      type="button"
                      onClick={() => setSelectedUrl(url)}
                      className={cn(
                        "text-[9px] font-black uppercase tracking-widest px-2 py-0.5 border transition-colors font-mono",
                        selectedUrl === url
                          ? "border-on-background bg-on-background text-surface"
                          : "border-on-background/20 hover:border-on-background/60"
                      )}
                      title={url}
                    >
                      {filename}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setSelectedUrl(null)}
                  className={cn(
                    "text-[9px] font-black uppercase tracking-widest px-2 py-0.5 border transition-colors",
                    selectedUrl === null
                      ? "border-on-background bg-on-background text-surface"
                      : "border-on-background/20 hover:border-on-background/60"
                  )}
                >
                  NO_FILE
                </button>
              </div>
            </div>
          )}

          {/* Toggles */}
          <div className="space-y-2">
            <span className="text-[9px] font-bold uppercase tracking-widest text-on-background/40">INCLUDE:</span>
            <div className="flex flex-wrap gap-1.5">
              <Toggle label="METADATA" enabled={includeMetadata} onChange={setIncludeMetadata} />
              <Toggle label="WAVEFUNC.LIVE" enabled={includeWavefuncRef} onChange={setIncludeWavefuncRef} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className="text-[9px] font-bold uppercase tracking-widest text-on-background/40 self-center">TAGS:</span>
              <Toggle label="#WAVEFUNC" enabled={tagWavefunc} onChange={setTagWavefunc} />
              <Toggle label="#SONGSTR" enabled={tagSongstr} onChange={setTagSongstr} />
              <Toggle label="#TUNESTR" enabled={tagTunestr} onChange={setTagTunestr} />
            </div>
          </div>

          {/* Editable preview */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase tracking-widest text-on-background/40">PREVIEW:</span>
              {isEdited && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-[9px] font-black uppercase tracking-widest text-on-background/40 hover:text-on-background transition-colors"
                >
                  RESET
                </button>
              )}
            </div>
            <textarea
              value={content}
              onChange={(e) => handleTextChange(e.target.value)}
              rows={6}
              className="w-full bg-surface-container-high border-2 border-on-background/20 focus:border-on-background outline-none px-3 py-2 text-[11px] font-mono resize-none leading-relaxed"
            />
          </div>

          {/* Actions */}
          {phase === "compose" && (
            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={onClose}
                className="border-2 border-on-background/30 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest hover:border-on-background transition-colors"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={handlePublish}
                disabled={!content.trim()}
                className="border-2 border-on-background px-3 py-1.5 text-[10px] font-black uppercase tracking-widest bg-on-background text-surface hover:opacity-80 transition-opacity disabled:opacity-40"
              >
                PUBLISH
              </button>
            </div>
          )}

          {phase === "publishing" && (
            <div className="flex items-center gap-2 text-on-background/60">
              <span className="material-symbols-outlined text-[16px]" style={{ animation: "spin 0.8s linear infinite" }}>sync</span>
              <span className="text-[10px] font-bold uppercase tracking-widest">PUBLISHING...</span>
            </div>
          )}

          {phase === "done" && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-primary">
                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                <span className="text-[10px] font-bold uppercase tracking-widest">PUBLISHED!</span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="border-2 border-on-background px-3 py-1.5 text-[10px] font-black uppercase tracking-widest hover:bg-on-background hover:text-surface transition-colors"
              >
                CLOSE
              </button>
            </div>
          )}

          {phase === "error" && (
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[14px] text-destructive shrink-0">error</span>
              <p className="text-[10px] font-bold uppercase tracking-tight text-destructive truncate flex-1">{errorMsg}</p>
              <button
                type="button"
                onClick={() => { setPhase("compose"); setErrorMsg(null); }}
                className="shrink-0 text-[9px] font-black uppercase tracking-widest border border-destructive px-2 py-0.5 text-destructive hover:bg-destructive hover:text-white transition-colors"
              >
                RETRY
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
