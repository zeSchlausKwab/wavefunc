import { useState } from "react";
import { useCurrentAccount } from "../lib/nostr/auth";
import { useUIStore } from "../stores/uiStore";
import { useSongFavorites } from "../lib/hooks/useSongFavorites";
import type { ParsedSong } from "../lib/nostr/domain";
import { cn } from "@/lib/utils";

interface Props {
  song: ParsedSong;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Saves an existing kind 31337 event directly to the user's crate.
 * Unlike SongFavoriteButton (which publishes a new song event from stream metadata),
 * this just adds the song's existing address to the user's list.
 */
export function CrateSaveButton({ song, size = "sm", className }: Props) {
  const currentUser = useCurrentAccount();
  const { addToDefaultList, removeFromAllLists, isInAnyList, isLoggedIn } =
    useSongFavorites();
  const pulseLogin = useUIStore((s) => s.pulseLogin);
  const [busy, setBusy] = useState(false);
  const [optimistic, setOptimistic] = useState<boolean | null>(null);

  const songAddress = song.address ?? "";
  const serverSaved = songAddress ? isInAnyList(songAddress) : false;
  const isSaved = optimistic !== null ? optimistic : serverSaved;

  const iconSize = size === "sm" ? "text-[14px]" : "text-[18px]";

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    if (!isLoggedIn || !currentUser?.pubkey || !songAddress) {
      pulseLogin();
      return;
    }

    const next = !isSaved;
    setOptimistic(next);
    setBusy(true);
    try {
      if (!next) {
        await removeFromAllLists(songAddress);
      } else {
        await addToDefaultList(songAddress);
      }
      setOptimistic(null);
    } catch (err) {
      console.error("CrateSaveButton error:", err);
      setOptimistic(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      className={cn(
        "flex items-center gap-1 transition-colors",
        isSaved ? "text-primary" : "text-on-background/40 hover:text-primary",
        className,
      )}
      title={!isLoggedIn ? "Log in to save" : isSaved ? "Remove from Crate" : "Save to Crate"}
    >
      {busy ? (
        <span
          className={cn("material-symbols-outlined", iconSize)}
          style={{ animation: "spin 0.8s linear infinite" }}
        >
          sync
        </span>
      ) : (
        <span
          className={cn("material-symbols-outlined", iconSize)}
          style={isSaved ? { fontVariationSettings: "'FILL' 1" } : {}}
        >
          star
        </span>
      )}
    </button>
  );
}
