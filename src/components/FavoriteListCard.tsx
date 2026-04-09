import { useState } from "react";
import { useFavorites, useFavoriteStations } from "../lib/hooks/useFavorites";
import { useSocialInteractions } from "../lib/hooks/useSocialInteractions";
import { RadioCard } from "./RadioCard";
import { EditFavoritesListForm } from "./EditFavoritesListForm";
import { SectionTitle } from "./SectionTitle";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { cn } from "../lib/utils";
import {
  buildReactionTemplate,
  type ParsedFavoritesList,
} from "../lib/nostr/domain";
import { useCurrentAccount } from "../lib/nostr/auth";
import { useWavefuncNostr } from "../lib/nostr/runtime";

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

interface FavoriteListCardProps {
  list: ParsedFavoritesList;
  isOwner: boolean;
  onDeleteList?: () => void;
}

export function FavoriteListCard({ list, isOwner, onDeleteList }: FavoriteListCardProps) {
  const [animationParent] = useAutoAnimate();
  const { stations: listStations, isLoading: stationsLoading } = useFavoriteStations(list);
  const { removeFavorite, updateFavoritesList } = useFavorites();
  const { zaps, reactions, userHasReacted } = useSocialInteractions(list.event);
  const currentUser = useCurrentAccount();
  const { signAndPublish } = useWavefuncNostr();
  const [isEditing, setIsEditing] = useState(false);
  const [, setShowZapDialog] = useState(false);

  const handleResonate = async () => {
    if (!currentUser) return;
    await signAndPublish(buildReactionTemplate(list.event), list.relays);
  };

  const packId = (list.favoritesId ?? "XX-00").slice(0, 8).toUpperCase();

  const handleRemoveStation = async (station: { pubkey?: string | null; stationId?: string | null }) => {
    if (isOwner) {
      await removeFavorite(station, list.favoritesId);
    }
  };

  const handleEditList = async (
    name: string,
    description: string,
    image?: string,
    banner?: string
  ) => {
    if (!list.favoritesId) return;
    await updateFavoritesList(list.favoritesId, {
      name,
      description,
      image,
      banner,
    });
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

      </div>

      {/* Content */}
      <div className="flex-1 p-4 flex flex-col gap-3 min-w-0">

        {/* Header */}
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            {list.image && (
              <img
                src={list.image}
                alt={list.name ?? "List image"}
                className="size-16 shrink-0 border-2 border-on-background object-cover bg-surface-container-low"
              />
            )}
            <div className="min-w-0 flex-1">
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
            </div>
          </div>
          {list.description && (
            <p className="text-[11px] text-on-background/50 mt-1.5 line-clamp-2 uppercase tracking-wide font-bold">
              {list.description}
            </p>
          )}
          {isOwner && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1.5 border-2 border-on-background px-3 py-1.5 text-[10px] font-black uppercase tracking-widest hover:bg-on-background hover:text-surface transition-colors"
                title="Edit list"
              >
                <span className="material-symbols-outlined text-[14px]">edit</span>
                EDIT_LIST
              </button>
              <button
                onClick={onDeleteList}
                className="flex items-center gap-1.5 border-2 border-red-700 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-red-700 hover:bg-red-700 hover:text-white transition-colors"
                title="Delete list"
              >
                <span className="material-symbols-outlined text-[14px]">delete</span>
                DELETE_LIST
              </button>
            </div>
          )}
        </div>

        {/* Stations */}
        <div ref={animationParent} className="flex-1 min-h-0">
          {stationsLoading ? (
            <div className="border-t-2 border-on-background/20 py-4 space-y-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="h-16 border-2 border-on-background/10 bg-surface-container-low animate-pulse"
                />
              ))}
            </div>
          ) : listStations.length === 0 ? (
            <div className="text-[10px] font-bold uppercase tracking-widest text-on-background/40 py-4 border-t-2 border-on-background/20">
              NO_STATIONS_LOADED
            </div>
          ) : (
            <div className="border-t-2 border-on-background/20 max-h-[260px] overflow-y-auto scrollbar-none">
              {listStations.map((station, i) => (
                <div
                  key={station.id}
                  className={cn(
                    "flex items-stretch",
                    isOwner && "border-b-2 border-outline/30"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <RadioCard
                      station={station}
                      variant="featured-item"
                      index={i}
                      className={isOwner ? "border-b-0" : undefined}
                    />
                  </div>
                  {isOwner && (
                    <button
                      onClick={() => handleRemoveStation(station)}
                      className="shrink-0 self-stretch w-12 text-on-background/35 hover:text-red-700 hover:bg-red-700/10 transition-colors border-l-2 border-on-background/20 flex items-center justify-center"
                      title="Remove from list"
                      aria-label="Remove from list"
                    >
                      <span className="material-symbols-outlined text-[14px]">delete</span>
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
