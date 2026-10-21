import { useEffect, useMemo, useState } from "react";

import {
  buildShareStationNoteTemplate,
  type ParsedStation,
} from "../lib/nostr/domain";
import { useWavefuncNostr } from "../lib/nostr/runtime";
import { canShareViaDevice, shareViaDevice } from "../lib/share";
import { showToast } from "../stores/toastStore";
import { useUIStore } from "../stores/uiStore";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

interface StationShareDialogProps {
  station: ParsedStation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type PublishPhase = "compose" | "publishing" | "done" | "error";

function extractHashtags(content: string): string[] {
  const hashtags: string[] = [];
  for (const match of content.matchAll(/#([\p{L}\p{N}_-]+)/gu)) {
    if (match[1]) hashtags.push(match[1]);
  }
  return hashtags;
}

function stationShareUrl(station: ParsedStation): string {
  if (typeof window === "undefined") {
    return station.naddr ? `/station/${station.naddr}` : "";
  }
  return station.naddr
    ? `${window.location.origin}/station/${station.naddr}`
    : "";
}

export function StationShareDialog({
  station,
  open,
  onOpenChange,
}: StationShareDialogProps) {
  const { signer, signAndPublish } = useWavefuncNostr();
  const pulseLogin = useUIStore((state) => state.pulseLogin);
  const url = stationShareUrl(station);
  const canUseSystemShare = canShareViaDevice();
  const stationName = station.name || "this station";
  const defaultContent = useMemo(
    () =>
      [
        `Listening to ${stationName} on Wavefunc`,
        url,
        "#wavefunc #radio",
      ]
        .filter(Boolean)
        .join("\n\n"),
    [stationName, url],
  );

  const [content, setContent] = useState(defaultContent);
  const [phase, setPhase] = useState<PublishPhase>("compose");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setContent(defaultContent);
    setPhase("compose");
    setErrorMessage(null);
  }, [defaultContent, open]);

  const copyLink = async () => {
    try {
      if (!url) throw new Error("Station link unavailable");
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      onOpenChange(false);
      showToast({
        tone: "success",
        title: "STATION_LINK_COPIED",
        message: "The canonical station link is ready to paste.",
        durationMs: 3500,
        key: "station-share-copy",
      });
    } catch {
      setErrorMessage("Your browser did not allow clipboard access.");
      setPhase("error");
    }
  };

  const shareWithDevice = async () => {
    const result = await shareViaDevice({
      url,
      title: station.name || "Wavefunc Radio",
      text: `Listen to ${stationName} on Wavefunc`,
    });
    if (result === "shared") {
      onOpenChange(false);
      return;
    }
    if (result === "failed" || result === "unavailable") {
      setErrorMessage("The system share dialog could not be opened.");
      setPhase("error");
    }
  };

  const publishNote = async () => {
    if (!signer) {
      onOpenChange(false);
      pulseLogin();
      return;
    }

    setPhase("publishing");
    setErrorMessage(null);
    try {
      await signAndPublish(
        buildShareStationNoteTemplate({
          station: station.event,
          content,
          url,
          hashtags: extractHashtags(content),
        }),
      );
      setPhase("done");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "The note could not be published.",
      );
      setPhase("error");
    }
  };

  const publishing = phase === "publishing";
  const changeOpen = (nextOpen: boolean) => {
    if (!nextOpen && publishing) return;
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-1rem)] max-w-xl overflow-y-auto rounded-none border-4 border-on-background bg-surface p-0 shadow-[8px_8px_0px_0px_rgba(29,28,19,1)]"
      >
        <DialogHeader className="border-b-4 border-on-background bg-on-background p-4 text-left text-surface sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle className="font-headline text-2xl font-black uppercase tracking-tight sm:text-3xl">
                SHARE_STATION
              </DialogTitle>
              <DialogDescription className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-surface/55">
                KIND_1 SIGNAL / COPY LINK / SYSTEM SHARE
              </DialogDescription>
            </div>
            <button
              type="button"
              onClick={() => changeOpen(false)}
              disabled={publishing}
              className="flex size-11 shrink-0 items-center justify-center border-2 border-surface/30 text-surface transition-colors hover:border-surface hover:bg-surface hover:text-on-background disabled:opacity-40"
              aria-label="Close share dialog"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </DialogHeader>

        <div className="space-y-5 p-4 sm:p-5">
          <div className="flex items-center gap-3 border-2 border-on-background bg-surface-container-low p-3">
            <div className="size-12 shrink-0 overflow-hidden border-2 border-on-background bg-on-background">
              {station.thumbnail ? (
                <img
                  src={station.thumbnail}
                  alt=""
                  className="h-full w-full object-cover grayscale"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-surface/50">
                  <span className="material-symbols-outlined">radio</span>
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate font-headline text-base font-black uppercase tracking-tight">
                {stationName}
              </p>
              <p className="truncate font-mono text-[9px] font-bold uppercase tracking-wider text-on-background/45">
                {station.genres?.slice(0, 3).join(" / ") || "INTERNET RADIO"}
              </p>
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.22em] text-on-background/50">
              NOSTR_NOTE
            </span>
            <textarea
              value={content}
              onChange={(event) => {
                setContent(event.target.value);
                if (phase === "error") {
                  setPhase("compose");
                  setErrorMessage(null);
                }
              }}
              disabled={publishing || phase === "done"}
              rows={7}
              className="w-full resize-none border-2 border-on-background bg-surface-container-low p-3 font-mono text-[12px] leading-relaxed outline-none transition-colors focus:bg-surface focus:ring-4 focus:ring-secondary-fixed-dim/50 disabled:opacity-60"
            />
          </label>

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={copyLink}
              disabled={publishing}
              className={`flex min-h-12 items-center justify-center gap-2 border-2 border-on-background bg-surface-container-low px-3 text-[10px] font-black uppercase tracking-widest transition-colors hover:bg-secondary-fixed-dim disabled:opacity-40 ${canUseSystemShare ? "" : "sm:col-span-2"}`}
            >
              <span className="material-symbols-outlined text-[18px]">link</span>
              COPY_LINK
            </button>
            {canUseSystemShare && (
              <button
                type="button"
                onClick={shareWithDevice}
                disabled={publishing}
                className="flex min-h-12 items-center justify-center gap-2 border-2 border-on-background bg-surface-container-low px-3 text-[10px] font-black uppercase tracking-widest transition-colors hover:bg-secondary-fixed-dim disabled:opacity-40 sm:col-start-2"
              >
                <span className="material-symbols-outlined text-[18px]">ios_share</span>
                SHARE_VIA_DEVICE
              </button>
            )}
          </div>

          {phase === "error" && (
            <div role="alert" className="flex items-start gap-2 border-2 border-destructive bg-destructive/10 p-3 text-destructive">
              <span className="material-symbols-outlined text-[18px]">error</span>
              <p className="min-w-0 break-words text-[10px] font-black uppercase tracking-wide">
                {errorMessage}
              </p>
            </div>
          )}

          {phase === "done" ? (
            <div className="flex flex-col gap-3 border-t-4 border-on-background pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div role="status" className="flex items-center gap-2 text-primary">
                <span className="material-symbols-outlined">check_circle</span>
                <span className="text-[10px] font-black uppercase tracking-widest">
                  NOTE_PUBLISHED
                </span>
              </div>
              <button
                type="button"
                onClick={() => changeOpen(false)}
                className="min-h-11 border-2 border-on-background px-5 text-[10px] font-black uppercase tracking-widest transition-colors hover:bg-on-background hover:text-surface"
              >
                CLOSE
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 border-t-4 border-on-background pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[9px] font-bold uppercase leading-relaxed tracking-wider text-on-background/45 sm:max-w-[15rem]">
                {signer
                  ? "PUBLIC NOTE — REVIEW BEFORE TRANSMITTING"
                  : "NOSTR SESSION REQUIRED TO PUBLISH"}
              </p>
              <button
                type="button"
                onClick={publishNote}
                disabled={publishing || !content.trim() || !url}
                className="flex min-h-12 items-center justify-center gap-2 border-2 border-on-background bg-primary px-5 text-[10px] font-black uppercase tracking-widest text-white shadow-[3px_3px_0px_0px_rgba(29,28,19,1)] transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none disabled:translate-x-0 disabled:translate-y-0 disabled:opacity-45 disabled:shadow-none"
              >
                <span
                  className={`material-symbols-outlined text-[18px] ${publishing ? "animate-spin" : ""}`}
                >
                  {publishing ? "sync" : signer ? "send" : "login"}
                </span>
                {publishing
                  ? "TRANSMITTING..."
                  : signer
                    ? "PUBLISH_TO_NOSTR"
                    : "CONNECT_TO_POST"}
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
