import { useState } from "react";
import { useCurrentAccount } from "../lib/nostr/auth";
import { useMetadataStore } from "../stores/metadataStore";
import { useUIStore } from "../stores/uiStore";
import { cn } from "@/lib/utils";
import { SongMediaDialog } from "./SongMediaDialog";

interface SongMagicButtonProps {
  size?: "sm" | "md";
  className?: string;
}

export function SongMagicButton({ size = "sm", className }: SongMagicButtonProps) {
  const currentUser = useCurrentAccount();
  const metadata = useMetadataStore((state) => state.currentMetadata);
  const pulseLogin = useUIStore((state) => state.pulseLogin);
  const [open, setOpen] = useState(false);

  if (!metadata?.song || metadata.song === "No metadata available") return null;

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
          "flex items-center justify-center text-on-background/40 transition-colors hover:text-primary",
          className,
        )}
        title="Save audio or video to Blossom"
      >
        <span className={cn("material-symbols-outlined", size === "sm" ? "text-[14px]" : "text-[18px]")}>auto_fix_high</span>
      </button>
      {open && <SongMediaDialog metadata={metadata} onClose={() => setOpen(false)} />}
    </>
  );
}
