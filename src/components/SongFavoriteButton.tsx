import { useMemo, useState } from "react";
import { useCurrentAccount } from "../lib/nostr/auth";
import { useWavefuncNostr } from "../lib/nostr/runtime";
import { useMetadataStore } from "../stores/metadataStore";
import { useUIStore } from "../stores/uiStore";
import {
  buildSongTemplateFromMetadata,
  deriveSongIdFromMetadata,
  getSongAddressForPubkey,
  type SongMetadataInput,
  useSongFavorites,
} from "../lib/hooks/useSongFavorites";
import { cn } from "@/lib/utils";

interface Props {
  size?: "sm" | "md";
  className?: string;
  metadata?: SongMetadataInput;
  showLabel?: boolean;
}

export function SongFavoriteButton({
  size = "sm",
  className,
  metadata,
  showLabel = false,
}: Props) {
  const currentUser = useCurrentAccount();
  const { signAndPublish } = useWavefuncNostr();
  const storeMetadata = useMetadataStore((s) => s.currentMetadata);
  const resolvedMetadata = metadata ?? storeMetadata ?? undefined;
  const {
    addToDefaultList,
    removeFromAllLists,
    isInAnyList,
    isLoggedIn,
    isLoading: favoritesLoading,
  } = useSongFavorites();
  const pulseLogin = useUIStore((s) => s.pulseLogin);
  const [busy, setBusy] = useState(false);
  // Optimistic: null = use server state, true/false = override until relay confirms
  const [optimistic, setOptimistic] = useState<boolean | null>(null);

  // Derive the canonical song address for the current track
  const songAddress = useMemo(() => {
    if (!resolvedMetadata || !currentUser?.pubkey) return null;
    const songId = deriveSongIdFromMetadata(resolvedMetadata);
    return getSongAddressForPubkey(songId, currentUser.pubkey);
  }, [resolvedMetadata, currentUser?.pubkey]);

  const serverFavorited = useMemo(
    () => (songAddress ? isInAnyList(songAddress) : false),
    [songAddress, isInAnyList],
  );
  const isFavorited = optimistic !== null ? optimistic : serverFavorited;

  const title =
    resolvedMetadata?.musicBrainz?.title || resolvedMetadata?.song || "";
  if (!resolvedMetadata || !title || title === "No metadata available") {
    return null;
  }

  const iconSize = size === "sm" ? "text-[14px]" : "text-[18px]";
  const actionLabel = !isLoggedIn
    ? "Log in to favorite this song"
    : favoritesLoading
      ? "Waiting for Liked Songs to finish syncing"
      : isFavorited
        ? "Remove from Liked Songs"
        : "Add to Liked Songs";

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy || favoritesLoading) return;
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
        const songTemplate = buildSongTemplateFromMetadata(resolvedMetadata);
        const songEvent = await signAndPublish(songTemplate);
        const songId = deriveSongIdFromMetadata(resolvedMetadata);
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
      type="button"
      onClick={handleClick}
      disabled={busy || favoritesLoading}
      aria-label={actionLabel}
      aria-pressed={isFavorited}
      aria-busy={busy || favoritesLoading}
      className={cn(
        "flex items-center justify-center transition-colors disabled:cursor-wait disabled:opacity-70",
        showLabel &&
          "min-h-11 gap-2 border-2 border-on-background px-3 text-[10px] font-black uppercase tracking-widest hover:bg-surface-variant",
        isFavorited
          ? "text-primary"
          : showLabel
            ? "text-on-background hover:text-primary"
            : "text-on-background/40 hover:text-primary",
        className,
      )}
      title={actionLabel}
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
      {showLabel && (
        <span aria-hidden="true">
          {favoritesLoading
            ? "SYNCING"
            : busy
              ? "SAVING"
              : isFavorited
                ? "SAVED"
                : "FAVORITE"}
        </span>
      )}
    </button>
  );
}
