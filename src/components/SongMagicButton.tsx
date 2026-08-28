import { useState } from "react";
import { useCurrentAccount } from "../lib/nostr/auth";
import type { SongMetadataInput } from "../lib/nostr/domain";
import { useMetadataStore } from "../stores/metadataStore";
import { useUIStore } from "../stores/uiStore";
import { cn } from "@/lib/utils";
import { SongMediaDialog } from "./SongMediaDialog";

interface SongMagicButtonProps {
  size?: "sm" | "md";
  className?: string;
  metadata?: SongMetadataInput;
  showLabel?: boolean;
}

export function SongMagicButton({
  size = "sm",
  className,
  metadata,
  showLabel = false,
}: SongMagicButtonProps) {
  const currentUser = useCurrentAccount();
  const storeMetadata = useMetadataStore((state) => state.currentMetadata);
  const resolvedMetadata = metadata ?? storeMetadata ?? undefined;
  const pulseLogin = useUIStore((state) => state.pulseLogin);
  const [open, setOpen] = useState(false);

  const title =
    resolvedMetadata?.musicBrainz?.title || resolvedMetadata?.song || "";
  if (!resolvedMetadata || !title || title === "No metadata available") {
    return null;
  }

  const actionLabel = currentUser
    ? "Save audio or video to Blossom"
    : "Log in to save this song to Blossom";

  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!currentUser) {
      pulseLogin();
      return;
    }
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          "flex items-center justify-center transition-colors hover:text-primary",
          showLabel ? "text-on-background" : "text-on-background/40",
          showLabel &&
            "min-h-11 gap-2 border-2 border-on-background px-3 text-[10px] font-black uppercase tracking-widest hover:bg-surface-variant",
          className,
        )}
        aria-label={actionLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={actionLabel}
      >
        <span
          className={cn(
            "material-symbols-outlined",
            size === "sm" ? "text-[14px]" : "text-[18px]",
          )}
        >
          auto_fix_high
        </span>
        {showLabel && <span aria-hidden="true">FORGE</span>}
      </button>
      {open && (
        <SongMediaDialog
          metadata={resolvedMetadata}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
