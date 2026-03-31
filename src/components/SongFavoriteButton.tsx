import { useMemo, useState } from "react";
import { useNDK, useNDKCurrentUser } from "@nostr-dev-kit/react";
import { usePlayerStore } from "../stores/playerStore";
import { useUIStore } from "../stores/uiStore";
import { useSongFavorites } from "../lib/hooks/useSongFavorites";
import { NDKSong } from "../lib/NDKSong";
import { cn } from "@/lib/utils";

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

interface Props {
  size?: "sm" | "md";
  className?: string;
}

export function SongFavoriteButton({ size = "sm", className }: Props) {
  const { ndk } = useNDK();
  const currentUser = useNDKCurrentUser();
  const { currentMetadata } = usePlayerStore();
  const { addToDefaultList, removeFromAllLists, isInAnyList, isLoggedIn } = useSongFavorites();
  const pulseLogin = useUIStore((s) => s.pulseLogin);
  const [busy, setBusy] = useState(false);
  // Optimistic: null = use server state, true/false = override until relay confirms
  const [optimistic, setOptimistic] = useState<boolean | null>(null);

  // Derive the canonical address for the current track
  const songAddress = useMemo(() => {
    if (!currentMetadata?.song || !currentUser?.pubkey) return null;
    const mb = currentMetadata.musicBrainz;
    const title = mb?.title || currentMetadata.song;
    const artist = mb?.artist || currentMetadata.artist || "";
    const dTag = mb?.id
      ? `mb-${mb.id}`
      : slugify(`${title}-by-${artist}`) || "unknown";
    return `31337:${currentUser.pubkey}:${dTag}`;
  }, [currentMetadata, currentUser?.pubkey]);

  const serverFavorited = useMemo(
    () => (songAddress ? isInAnyList(songAddress) : false),
    [songAddress, isInAnyList]
  );
  // Once relay confirms, drop the optimistic override
  const isFavorited = optimistic !== null ? optimistic : serverFavorited;

  if (!currentMetadata?.song) return null;

  const iconSize = size === "sm" ? "text-[14px]" : "text-[18px]";

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    if (!isLoggedIn) { pulseLogin(); return; }
    if (!ndk || !currentUser?.pubkey) return;

    const next = !isFavorited;
    setOptimistic(next);
    setBusy(true);
    try {
      if (!next && songAddress) {
        await removeFromAllLists(songAddress);
      } else {
        const song = NDKSong.fromMetadata(ndk, currentMetadata, currentUser.pubkey);
        await song.sign();
        await song.publish();
        await addToDefaultList(song.address);
      }
      // Let the subscription take over — clear optimistic state
      setOptimistic(null);
    } catch (err) {
      console.error("Song favourite error:", err);
      setOptimistic(null); // revert on error
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      className={cn(
        "flex items-center justify-center transition-colors",
        isFavorited ? "text-primary" : "text-on-background/40 hover:text-primary",
        className
      )}
      title={
        !isLoggedIn
          ? "Log in to like songs"
          : isFavorited
          ? "Remove from Liked Songs"
          : "Add to Liked Songs"
      }
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
          style={isFavorited ? { fontVariationSettings: "'FILL' 1" } : {}}
        >
          star
        </span>
      )}
    </button>
  );
}
