import { useState } from "react";
import { useNDKCurrentUser } from "@nostr-dev-kit/react";
import { useFavorites, useFavoriteStations } from "../lib/hooks/useFavorites";
import { useSocialInteractions } from "../lib/hooks/useSocialInteractions";
import { RadioCard } from "./RadioCard";
import { NDKWFFavorites } from "../lib/NDKWFFavorites";
import { EditFavoritesListForm } from "./EditFavoritesListForm";
import { SectionTitle } from "./SectionTitle";
import { ZapDialog } from "./ZapDialog";
import type { NDKStation } from "../lib/NDKStation";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { cn } from "../lib/utils";

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

interface FavoriteListCardProps {
  list: NDKWFFavorites;
  isOwner: boolean;
  onDeleteList?: () => void;
}

export function FavoriteListCard({ list, isOwner, onDeleteList }: FavoriteListCardProps) {
  const [animationParent] = useAutoAnimate();
  const { stations: listStations } = useFavoriteStations(list);
  const { removeFavorite } = useFavorites();
  const { zaps, reactions, userHasReacted } = useSocialInteractions(list);
  const currentUser = useNDKCurrentUser();
  const [isEditing, setIsEditing] = useState(false);
  const [showZapDialog, setShowZapDialog] = useState(false);

  const handleResonate = async () => {
    if (!currentUser) return;
    await list.react("❤️");
  };

  const packId = (list.favoritesId ?? "XX-00").slice(0, 8).toUpperCase();

  const handleRemoveStation = async (station: any) => {
    if (isOwner) await removeFavorite(station);
  };

  const handleEditList = async (name: string, description: string, banner?: string) => {
    list.name = name;
    list.description = description;
    if (banner) list.banner = banner;
    await list.sign();
    await list.publish();
    setIsEditing(false);
  };

  const handleShare = () => {
    navigator.clipboard?.writeText(`${window.location.origin}/favorites`);
  };

  if (isEditing) {
    return (
      <div className="border-4 border-on-background bg-surface-container-high p-4 shadow-[6px_6px_0px_0px_rgba(29,28,19,1)]">
        <EditFavoritesListForm
          list={list}
          onSubmit={handleEditList}
          onCancel={() => setIsEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="bg-surface-container-high border-4 border-on-background shadow-[6px_6px_0px_0px_rgba(29,28,19,1)] flex flex-col overflow-hidden relative">

      {/* Banner */}
      <div className="relative h-36 bg-on-background overflow-hidden group shrink-0">
        {list.banner ? (
          <img
            src={list.banner}
            alt={list.name ?? "List"}
            className="w-full h-full object-cover grayscale contrast-125 group-hover:grayscale-0 transition-all duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="material-symbols-outlined text-7xl text-surface/10">queue_music</span>
          </div>
        )}

        {/* Bottom label */}
        <div className="absolute bottom-0 left-0 right-0 bg-on-background text-surface text-[9px] px-2 py-1 font-bold tracking-widest uppercase">
          STATION_VISUAL_FEED
        </div>

        {/* Owner actions */}
        {isOwner && (
          <div className="absolute top-2 right-2 flex gap-1 z-10">
            <button
              onClick={() => setIsEditing(true)}
              className="bg-on-background/80 text-surface p-1.5 hover:bg-primary transition-colors"
              title="Edit list"
            >
              <span className="material-symbols-outlined text-[14px]">edit</span>
            </button>
            <button
              onClick={onDeleteList}
              className="bg-on-background/80 text-surface p-1.5 hover:bg-red-600 transition-colors"
              title="Delete list"
            >
              <span className="material-symbols-outlined text-[14px]">delete</span>
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 p-4 flex flex-col gap-3 min-w-0">

        {/* Header */}
        <div>
          <SectionTitle className="text-2xl mb-1">
            {list.name || "UNNAMED_LIST"}
          </SectionTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="bg-on-background text-surface text-[9px] px-2 py-0.5 font-bold uppercase tracking-tighter">
              PACK_ID: {packId}
            </span>
            <span className="text-outline text-[9px] font-bold uppercase tracking-widest">
              {listStations.length} STATION{listStations.length !== 1 ? "S" : ""}
            </span>
          </div>
          {list.description && (
            <p className="text-[11px] text-on-background/50 mt-1.5 line-clamp-2 uppercase tracking-wide font-bold">
              {list.description}
            </p>
          )}
        </div>

        {/* Stations */}
        <div ref={animationParent} className="flex-1 min-h-0">
          {listStations.length === 0 ? (
            <div className="text-[10px] font-bold uppercase tracking-widest text-on-background/40 py-4 border-t-2 border-on-background/20">
              NO_STATIONS_LOADED
            </div>
          ) : (
            <div className="border-t-2 border-on-background/20 max-h-[260px] overflow-y-auto scrollbar-none">
              {listStations.map((station, i) => (
                <div key={station.id} className="flex items-stretch">
                  <div className="flex-1 min-w-0">
                    <RadioCard
                      station={station}
                      variant="featured-item"
                      index={i}
                    />
                  </div>
                  {isOwner && (
                    <button
                      onClick={() => handleRemoveStation(station)}
                      className="shrink-0 px-2 text-on-background/30 hover:text-red-500 hover:bg-red-500/10 transition-colors border-l-2 border-on-background/20"
                      title="Remove from list"
                    >
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Social toolbar */}
        <div className="flex items-center justify-between pt-3 border-t-4 border-on-background mt-auto">
          <div className="flex gap-4">
            <button
              className="flex items-center gap-1 hover:text-secondary-fixed-dim transition-colors"
              onClick={() => setShowZapDialog(true)}
              title="Zap"
            >
              <span className="material-symbols-outlined text-[15px]">bolt</span>
              {zaps > 0 && (
                <span className="text-[10px] font-bold">{formatCount(zaps)}</span>
              )}
            </button>
            <button
              className="flex items-center gap-1 hover:text-primary transition-colors"
              onClick={handleShare}
              title="Share"
            >
              <span className="material-symbols-outlined text-[15px]">share</span>
            </button>
          </div>
          <button
            className={cn(
              "px-3 py-1.5 flex items-center gap-1.5 text-white shadow-[3px_3px_0px_0px_rgba(29,28,19,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all",
              userHasReacted ? "bg-on-background" : "bg-primary"
            )}
            onClick={handleResonate}
            title="Resonate"
          >
            <span
              className="material-symbols-outlined text-[14px]"
              style={{ fontVariationSettings: userHasReacted ? "'FILL' 1" : "'FILL' 0" }}
            >
              favorite
            </span>
            <span className="text-[9px] font-black uppercase tracking-widest">
              {reactions > 0 ? `RESONATE · ${formatCount(reactions)}` : "RESONATE"}
            </span>
          </button>
        </div>

      </div>
    </div>
  );
}
