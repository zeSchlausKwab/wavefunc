import { useMemo, useState } from "react";
import { useCurrentAccount } from "../lib/nostr/auth";
import { useWavefuncNostr } from "../lib/nostr/runtime";
import { usePlayerStore } from "../stores/playerStore";
import { useUIStore } from "../stores/uiStore";
import {
  buildSongTemplateFromMetadata,
  deriveSongIdFromMetadata,
  getSongAddressForPubkey,
  useSongFavorites,
} from "../lib/hooks/useSongFavorites";
import { cn } from "@/lib/utils";

interface Props {
  size?: "sm" | "md";
  className?: string;
}

export function SongFavoriteButton({ size = "sm", className }: Props) {
  const currentUser = useCurrentAccount();
  const { signAndPublish } = useWavefuncNostr();
  const { currentMetadata } = usePlayerStore();
  const { addToDefaultList, removeFromAllLists, isInAnyList, isLoggedIn } =
    useSongFavorites();
  const pulseLogin = useUIStore((s) => s.pulseLogin);
  const [busy, setBusy] = useState(false);
  // Optimistic: null = use server state, true/false = override until relay confirms
  const [optimistic, setOptimistic] = useState<boolean | null>(null);

  // Derive the canonical song address for the current track
  const songAddress = useMemo(() => {
    if (!currentMetadata?.song || !currentUser?.pubkey) return null;
    const songId = deriveSongIdFromMetadata(currentMetadata);
    return getSongAddressForPubkey(songId, currentUser.pubkey);
  }, [currentMetadata, currentUser?.pubkey]);

  const serverFavorited = useMemo(
    () => (songAddress ? isInAnyList(songAddress) : false),
    [songAddress, isInAnyList],
  );
  const isFavorited = optimistic !== null ? optimistic : serverFavorited;

  if (!currentMetadata?.song) return null;

  const iconSize = size === "sm" ? "text-[14px]" : "text-[18px]";

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    if (!isLoggedIn || !currentUser?.pubkey) {
      pulseLogin();
      return;
    }

    const next = !isFavorited;
    setOptimistic(next);
    setBusy(true);
    try {
      if (!next && songAddress) {
        await removeFromAllLists(songAddress);
      } else {
        // Publish the song event itself first, then add it to the default list.
        const songTemplate = buildSongTemplateFromMetadata(currentMetadata);
        const songEvent = await signAndPublish(songTemplate);
        const songId = deriveSongIdFromMetadata(currentMetadata);
        const address = getSongAddressForPubkey(songId, songEvent.pubkey);
        await addToDefaultList(address);
      }
      setOptimistic(null);
    } catch (err) {
      console.error("Song favourite error:", err);
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
        "flex items-center justify-center transition-colors",
        isFavorited ? "text-primary" : "text-on-background/40 hover:text-primary",
        className,
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
