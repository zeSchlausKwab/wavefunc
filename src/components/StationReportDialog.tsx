import { useState } from "react";

import {
  buildStationReportTemplate,
  type ParsedStation,
  type StationReportLabel,
} from "../lib/nostr/domain";
import { useCurrentAccount } from "../lib/nostr/auth";
import { useWavefuncNostr } from "../lib/nostr/runtime";
import { cn } from "../lib/utils";
import { showToast } from "../stores/toastStore";
import { useUIStore } from "../stores/uiStore";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

const LABELS: Array<{
  value: StationReportLabel;
  label: string;
  tone: "positive" | "negative" | "neutral";
}> = [
  { value: "up", label: "WORKS", tone: "positive" },
  { value: "adfree", label: "AD_FREE", tone: "positive" },
  { value: "down", label: "STREAM_DOWN", tone: "negative" },
  { value: "ads", label: "HAS_ADS", tone: "neutral" },
  { value: "http-insecure", label: "HTTP_ONLY", tone: "neutral" },
  { value: "metadata-wrong", label: "WRONG_METADATA", tone: "negative" },
  { value: "duplicate", label: "DUPLICATE", tone: "negative" },
];

export function StationReportDialog({ station }: { station: ParsedStation }) {
  const account = useCurrentAccount();
  const { signAndPublish } = useWavefuncNostr();
  const pulseLogin = useUIStore((state) => state.pulseLogin);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState<StationReportLabel>("up");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!account || !station.address) return;
    setSubmitting(true);
    try {
      await signAndPublish(
        buildStationReportTemplate({
          stationAddress: station.address,
          stationPubkey: station.pubkey,
          label,
          note,
        }),
      );
      setOpen(false);
      setNote("");
      showToast({
        tone: "success",
        title: "SIGNAL_RECORDED",
        message: "Your signed station observation was published.",
      });
    } catch (error) {
      showToast({
        tone: "error",
        title: "REPORT_FAILED",
        message: error instanceof Error ? error.message : "Could not publish the report.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (!account) {
            pulseLogin();
            return;
          }
          setOpen(true);
        }}
        className={cn(
          "flex items-center gap-1 text-on-background/45 transition-colors hover:text-primary",
          !account && "opacity-40",
        )}
        title={account ? "Report or confirm station quality" : "Log in to report station quality"}
      >
        <span className="material-symbols-outlined text-[18px]">fact_check</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-none border-4 border-on-background bg-surface p-0 shadow-[8px_8px_0px_0px_rgba(29,28,19,1)]">
          <DialogHeader className="border-b-4 border-on-background p-5 text-left">
            <DialogTitle className="font-headline text-2xl font-black uppercase tracking-tight">
              REPORT_SIGNAL
            </DialogTitle>
            <DialogDescription className="text-[10px] font-bold uppercase tracking-widest text-on-background/50">
              Signed public evidence for {(station.name || "this station").toUpperCase()}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 p-5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {LABELS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setLabel(option.value)}
                  className={cn(
                    "min-h-12 border-2 border-on-background px-2 py-2 text-[9px] font-black uppercase tracking-widest",
                    label === option.value
                      ? option.tone === "positive"
                        ? "bg-[#a7e5c1]"
                        : option.tone === "negative"
                          ? "bg-primary text-white"
                          : "bg-secondary-fixed-dim"
                      : "bg-surface-container-low hover:bg-on-background hover:text-surface",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <label className="block">
              <span className="mb-1 block text-[9px] font-black uppercase tracking-widest text-on-background/50">
                OPTIONAL_NOTE
              </span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value.slice(0, 280))}
                className="min-h-20 w-full resize-none border-2 border-on-background bg-surface-container-low p-3 text-sm font-bold outline-none focus:bg-surface"
                placeholder="WHAT_DID_YOU_OBSERVE?"
              />
            </label>
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="w-full border-2 border-on-background bg-primary px-4 py-3 text-xs font-black uppercase tracking-widest text-white shadow-[3px_3px_0px_0px_rgba(29,28,19,1)] transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none disabled:opacity-50"
            >
              {submitting ? "TRANSMITTING..." : "PUBLISH_OBSERVATION"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
