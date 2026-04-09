import { Edit3, MoreVertical, Trash2 } from "lucide-react";
import React, { useState, useRef, useEffect, useCallback } from "react";

// Handles broken URLs by falling back to the placeholder on load error.
// Off-black bg (#252418) is visibly distinct from the border color (#1d1c13).
function StationThumbnail({
  src,
  alt,
  imgClassName,
  iconSize = "text-8xl",
}: {
  src?: string | null;
  alt: string;
  imgClassName?: string;
  iconSize?: string;
}) {
  const [error, setError] = useState(false);
  const handleError = useCallback(() => setError(true), []);

  if (src && !error) {
    return (
      <img src={src} alt={alt} className={imgClassName} onError={handleError} />
    );
  }
  return (
    <div className="w-full h-full bg-[#252418] flex items-center justify-center">
      <span className={cn("material-symbols-outlined text-white/15", iconSize)}>radio</span>
    </div>
  );
}
import { Link } from "@tanstack/react-router";
import {
  buildStationDeletionTemplate,
  buildStationReactionTemplate,
  type ParsedStation,
  type Stream,
} from "../lib/nostr/domain";
import {
  canPlayStreamInApp,
  getDefaultSelectedStream,
  openStreamExternally,
} from "../lib/player/adapters";
import { usePlayerStore } from "../stores/playerStore";
import { useFilterStore } from "../stores/filterStore";
import { useUIStore } from "../stores/uiStore";
import { useWavefuncNostr } from "../lib/nostr/runtime";
import { useFavorites } from "../lib/hooks/useFavorites";
import { useSocialInteractions } from "../lib/hooks/useSocialInteractions";
import { FavoritesDropdown } from "./FavoritesDropdown";
import { StationManagementSheet } from "./StationManagementSheet";
import { StreamSelector } from "./StreamSelector";
import { ZapDialog } from "./ZapDialog";
import { StreamQualityBar } from "./StreamQualityBar";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import { useCurrentAccount } from "../lib/nostr/auth";

const MIME_TO_FORMAT: Record<string, string> = {
  "audio/mpeg": "MP3",
  "audio/mp3": "MP3",
  "audio/aac": "AAC",
  "audio/mp4": "AAC",
  "audio/ogg": "OGG",
  "audio/flac": "FLAC",
  "audio/wav": "WAV",
  "audio/x-wav": "WAV",
  "application/x-mpegurl": "HLS",
  "application/vnd.apple.mpegurl": "HLS",
  "audio/x-hls": "HLS",
};

function normalizeBitrate(bitrate?: number): number | undefined {
  if (!bitrate || bitrate <= 0) return undefined;
  return bitrate >= 1000 ? Math.round(bitrate / 1000) : Math.round(bitrate);
}

function streamFormatLabel(format: string, bitrate?: number): string {
  const name = MIME_TO_FORMAT[format.toLowerCase()] ?? format.split("/").pop()?.toUpperCase() ?? format.toUpperCase();
  const normalized = normalizeBitrate(bitrate);
  return normalized ? `${name} ${normalized}K` : name;
}

export type RadioCardVariant = "tile" | "list" | "list-compact" | "search-result" | "featured-item";

interface RadioCardProps {
  station: ParsedStation;
  className?: string;
  variant?: RadioCardVariant;
  index?: number;
}

export const RadioCard: React.FC<RadioCardProps> = ({
  station,
  className,
  variant = "tile",
  index,
}) => {
  const { currentStation, isPlaying, playStation, pause } = usePlayerStore();
  const { toggleGenre } = useFilterStore();
  const currentUser = useCurrentAccount();
  const { signAndPublish } = useWavefuncNostr();
  const { addFavorite, removeFavorite } = useFavorites();
  const isLoggedIn = !!currentUser;
  const {
    reactions,
    zaps,
    comments,
    userHasReacted,
    userHasZapped,
    userHasCommented,
  } = useSocialInteractions(station.event);

  const { openStationSheet } = useUIStore();

  const [showActionMenu, setShowActionMenu] = useState(false);
  const [showZapDialog, setShowZapDialog] = useState(false);
  const [selectedStream, setSelectedStream] = useState<Stream | undefined>(
    () => getDefaultSelectedStream(station.streams)
  );

  useEffect(() => {
    setSelectedStream(getDefaultSelectedStream(station.streams));
  }, [station.id, station.content]);

  const isCurrentStation = currentStation?.id === station.id;
  const isCurrentlyPlaying = isCurrentStation && isPlaying;
  const isOwner = currentUser?.pubkey === station.pubkey;
  const selectedStreamRequiresExternal =
    selectedStream ? !canPlayStreamInApp(selectedStream) : false;

  const handlePlayClick = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (selectedStream?.url && selectedStreamRequiresExternal) {
      openStreamExternally(selectedStream.url);
      return;
    }
    if (isCurrentlyPlaying) pause();
    else playStation(station, selectedStream);
  };

  const handleCommentClick = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    openStationSheet(station, true);
  };

  const handleAddToList = async (listId: string) => {
    await addFavorite(station, listId);
  };

  const handleRemoveFromList = async (listId: string) => {
    await removeFavorite(station, listId);
  };

  const handleDeleteStation = async () => {
    if (!confirm(`Are you sure you want to delete "${station.name}"? This action cannot be undone.`)) return;
    try {
      await signAndPublish(
        buildStationDeletionTemplate({
          eventId: station.id,
          pubkey: station.pubkey,
          stationId: station.stationId,
        }),
      );
      setShowActionMenu(false);
    } catch (error) {
      console.error("Failed to delete station:", error);
      alert("Failed to delete the station. Please try again.");
    }
  };

  const handleShare = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    navigator.clipboard?.writeText(`${window.location.origin}/station/${station.naddr}`);
  };

  const handleLike = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!currentUser) return;
    await signAndPublish(buildStationReactionTemplate(station.event));
  };

  const statusLabel = isCurrentlyPlaying
    ? "SIGNAL_ACTIVE"
    : isCurrentStation
      ? "LOW_VOLTAGE"
      : (selectedStream ? streamFormatLabel(selectedStream.format, selectedStream.quality?.bitrate) : "STDBY");

  const renderStreamBadge = (className?: string) => {
    const badge = (
      <button
        type="button"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "inline-flex items-center gap-1.5 border px-1.5 py-1 text-[10px] font-black uppercase tracking-widest transition-colors",
          selectedStreamRequiresExternal
            ? "border-secondary-fixed-dim text-secondary-fixed-dim"
            : isCurrentlyPlaying
              ? "border-primary text-primary"
              : "border-outline text-outline",
          station.streams.length > 1 && "hover:bg-secondary-fixed-dim/10",
          className
        )}
        title={selectedStreamRequiresExternal ? "Open stream at source" : "Select stream source"}
      >
        <span>{statusLabel}</span>
        {selectedStreamRequiresExternal && (
          <span className="material-symbols-outlined text-[12px]">open_in_new</span>
        )}
        {station.streams.length > 1 && (
          <span className="material-symbols-outlined text-[12px]">arrow_drop_down</span>
        )}
      </button>
    );

    if (station.streams.length <= 1) return badge;

    return (
      <StreamSelector
        streams={station.streams}
        selectedStreamUrl={selectedStream?.url}
        onStreamSelect={setSelectedStream}
        trigger={badge}
      />
    );
  };

  const renderQualitySelector = (className?: string) => {
    const trigger = (
      <button
        type="button"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "inline-flex items-center gap-2 rounded-none bg-transparent p-0 hover:bg-transparent",
          className
        )}
        title={selectedStreamRequiresExternal ? "Open stream at source" : "Select stream source"}
      >
        <StreamQualityBar
          stream={selectedStream}
          isActive={isCurrentlyPlaying}
          className="w-full"
        />
        {selectedStreamRequiresExternal && (
          <span className="material-symbols-outlined text-[14px] text-secondary-fixed-dim">
            open_in_new
          </span>
        )}
        {station.streams.length > 1 && (
          <span className="material-symbols-outlined text-[14px] text-on-background/50">
            arrow_drop_down
          </span>
        )}
      </button>
    );

    if (station.streams.length <= 1) return trigger;

    return (
      <StreamSelector
        streams={station.streams}
        selectedStreamUrl={selectedStream?.url}
        onStreamSelect={setSelectedStream}
        trigger={trigger}
      />
    );
  };

  const nameDisplay = (station.name || "UNKNOWN_STATION")
    .toUpperCase()
    .replace(/\s+/g, "_");

  const titleRef = useRef<HTMLDivElement>(null);
  const [isMarquee, setIsMarquee] = useState(false);
  useEffect(() => {
    const el = titleRef.current;
    if (el) setIsMarquee(el.scrollWidth > el.clientWidth);
  }, [nameDisplay]);

  const displayIndex =
    index !== undefined ? String(index + 1).padStart(2, "0") : null;

  const ownerMenu = isOwner && (
    <div className="absolute top-2 right-2 z-10">
      <Button
        size="icon"
        className="opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => { e.stopPropagation(); setShowActionMenu(!showActionMenu); }}
      >
        <MoreVertical className="w-4 h-4" />
      </Button>
      {showActionMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowActionMenu(false)} />
          <div className="absolute right-0 top-full mt-1 w-40 bg-background border-4 border-on-background z-50">
            <StationManagementSheet
              station={station}
              mode="edit"
              trigger={
                <Button variant="ghost" className="w-full justify-start text-sm">
                  <Edit3 className="w-4 h-4 mr-2" /> Edit
                </Button>
              }
            />
            <Button
              variant="ghost"
              className="w-full justify-start text-sm text-destructive"
              onClick={handleDeleteStation}
            >
              <Trash2 className="w-4 h-4 mr-2" /> Delete
            </Button>
          </div>
        </>
      )}
    </div>
  );

  const favButton = isLoggedIn && station.pubkey && station.stationId ? (
    <FavoritesDropdown
      station={station}
      onAddToList={handleAddToList}
      onRemoveFromList={handleRemoveFromList}
      triggerClassName="px-4 h-full flex items-center justify-center hover:bg-primary hover:text-white transition-colors"
    />
  ) : (
    <div className="px-4 h-full flex items-center justify-center opacity-30">
      <span className="material-symbols-outlined text-xl">star</span>
    </div>
  );

  const zapDialog = (
    <ZapDialog
      station={station}
      open={showZapDialog}
      onOpenChange={setShowZapDialog}
      onZap={async (amount) => { console.log(`Zapping ${amount} sats to station:`, station.name); }}
    />
  );

  // ─── TILE ────────────────────────────────────────────────────────────────────
  if (variant === "tile") {
    return (
      <>
        <div className={cn(
          "group relative bg-surface border-4 border-on-surface overflow-hidden shadow-[8px_8px_0px_0px_rgba(29,28,19,1)] flex flex-col hover:-translate-y-1 hover:-translate-x-1 hover:shadow-[12px_12px_0px_0px_rgba(182,0,19,1)] transition-all",
          className
        )}>
          {ownerMenu}

          {/* ── Mobile: horizontal layout (< md) ── */}
          <div className="flex md:hidden">
            <div className="w-20 h-20 shrink-0 relative overflow-hidden border-r-4 border-on-surface">
              <StationThumbnail
                src={station.thumbnail}
                alt={station.name || "Station"}
                imgClassName="w-full h-full object-cover"
                iconSize="text-4xl"
              />
            </div>
            <div className="flex flex-1 items-center min-w-0 px-3 gap-2">
              <div className="flex flex-col justify-center min-w-0 flex-1">
                <h3 className="text-sm font-black uppercase tracking-tighter truncate font-headline cursor-pointer hover:text-primary transition-colors"
                  onClick={() => openStationSheet(station)}>{nameDisplay}</h3>
                {station.genres?.[0] && (
                  <span className="text-[10px] font-black text-tertiary uppercase tracking-widest truncate cursor-pointer"
                    onClick={() => toggleGenre(station.genres![0] ?? "")}>
                    {station.genres[0].toUpperCase()}
                  </span>
                )}
                <div className="mt-1 overflow-hidden">{renderStreamBadge("max-w-full truncate")}</div>
              </div>
              <button
                className="w-10 h-10 bg-primary text-white border-2 border-on-surface flex items-center justify-center active:scale-90 transition-transform shrink-0"
                onClick={handlePlayClick}
                title={
                  selectedStreamRequiresExternal
                    ? "Open stream source"
                    : isCurrentlyPlaying
                      ? "Pause"
                      : "Play"
                }
              >
                <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                  {selectedStreamRequiresExternal
                    ? "open_in_new"
                    : isCurrentlyPlaying
                      ? "pause"
                      : "play_arrow"}
                </span>
              </button>
            </div>
          </div>

          {/* ── Desktop: vertical layout (md+) ── */}

          {/* Thumbnail + play */}
          <div className="hidden md:block h-40 relative overflow-hidden border-b-4 border-on-surface">
            <StationThumbnail
              src={station.thumbnail}
              alt={station.name || "Station"}
              imgClassName="w-full h-full object-cover transition-all"
            />
            <button
              className="absolute bottom-2 right-2 w-10 h-10 bg-primary text-white border-2 border-on-surface flex items-center justify-center active:scale-90 transition-transform shadow-[3px_3px_0px_0px_rgba(29,28,19,1)]"
              onClick={handlePlayClick}
              title={
                selectedStreamRequiresExternal
                  ? "Open stream source"
                  : isCurrentlyPlaying
                    ? "Pause"
                    : "Play"
              }
            >
              <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                {selectedStreamRequiresExternal
                  ? "open_in_new"
                  : isCurrentlyPlaying
                    ? "pause"
                    : "play_arrow"}
              </span>
            </button>
          </div>

          {/* Info (desktop only) */}
          <div className="hidden md:block p-3 flex-1">
            <div className="flex justify-between items-start mb-2 gap-2">
              <div ref={titleRef} className="overflow-hidden">
              {isMarquee ? (
                <div className="flex whitespace-nowrap animate-marquee">
                  <h3
                    className="text-base font-black uppercase tracking-tighter leading-tight cursor-pointer hover:text-primary transition-colors font-headline pr-12"
                    onClick={() => openStationSheet(station)}
                  >
                    {nameDisplay}
                  </h3>
                  <h3
                    className="text-base font-black uppercase tracking-tighter leading-tight font-headline pr-12"
                    aria-hidden
                  >
                    {nameDisplay}
                  </h3>
                </div>
              ) : (
                <h3
                  className="text-base font-black uppercase tracking-tighter leading-tight cursor-pointer hover:text-primary transition-colors font-headline whitespace-nowrap"
                  onClick={() => openStationSheet(station)}
                >
                  {nameDisplay}
                </h3>
              )}
            </div>
              <div className="shrink-0">{renderStreamBadge()}</div>
            </div>
            <p className="text-xs font-bold text-tertiary uppercase tracking-widest mb-4">
              MAINTAINER: {(station.pubkey || "UNKNOWN").slice(0, 8).toUpperCase()}
            </p>
            <div className="flex flex-wrap gap-2">
              {station.genres?.slice(0, 3).map((genre, i) => (
                <span
                  key={i}
                  className="text-[10px] font-black bg-surface-container-highest px-2 py-0.5 border border-on-surface cursor-pointer hover:bg-primary hover:text-white transition-colors"
                  onClick={() => toggleGenre(genre)}
                >
                  {genre.toUpperCase()}
                </span>
              ))}
            </div>
          </div>

          {/* Action bar */}
          <div className="grid grid-cols-5 border-t-2 md:border-t-4 border-on-surface bg-surface-container-low">
            <button
              className="py-1.5 md:py-2.5 flex items-center justify-center border-r-2 border-on-surface hover:bg-secondary-fixed-dim transition-colors"
              onClick={handleCommentClick}
              title={`Comment${comments > 0 ? ` (${comments})` : ""}`}
            >
              <span className={cn("material-symbols-outlined text-[16px] md:text-[18px]", userHasCommented && "text-primary")}>
                message
              </span>
            </button>
            <button
              className="py-1.5 md:py-2.5 flex items-center justify-center border-r-2 border-on-surface hover:bg-secondary-fixed-dim transition-colors"
              onClick={handleLike}
              title={`Like${reactions > 0 ? ` (${reactions})` : ""}`}
            >
              <span className={cn("material-symbols-outlined text-[16px] md:text-[18px]", userHasReacted && "text-primary")} style={userHasReacted ? { fontVariationSettings: "'FILL' 1" } : {}}>
                favorite
              </span>
            </button>
            <button
              className="py-1.5 md:py-2.5 flex items-center justify-center border-r-2 border-on-surface hover:bg-secondary-fixed-dim transition-colors"
              onClick={() => setShowZapDialog(true)}
              title={`Zap${zaps > 0 ? ` (${zaps})` : ""}`}
            >
              <span className={cn("material-symbols-outlined text-[16px] md:text-[18px]", userHasZapped && "text-yellow-500")}>
                bolt
              </span>
            </button>
            <button
              className="py-1.5 md:py-2.5 flex items-center justify-center border-r-2 border-on-surface hover:bg-secondary-fixed-dim transition-colors"
              onClick={handleShare}
              title="Share"
            >
              <span className="material-symbols-outlined text-[16px] md:text-[18px]">share</span>
            </button>
            <div>
              {isLoggedIn && station.pubkey && station.stationId ? (
                <FavoritesDropdown
                  station={station}
                  onAddToList={handleAddToList}
                  onRemoveFromList={handleRemoveFromList}
                  triggerClassName="py-1.5 md:py-2.5 w-full flex items-center justify-center hover:bg-primary hover:text-white transition-colors"
                  iconSize="text-[16px] md:text-[18px]"
                />
              ) : (
                <div className="py-1.5 md:py-2.5 flex items-center justify-center opacity-30">
                  <span className="material-symbols-outlined text-[16px] md:text-[18px]">star</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {zapDialog}
      </>
    );
  }

  // ─── LIST ─────────────────────────────────────────────────────────────────────
  if (variant === "list") {
    return (
      <>
        <section className={cn(
          "group relative bg-surface border-4 border-on-background flex flex-col md:flex-row hover:shadow-[8px_8px_0px_0px_#00dbe9] transition-all duration-150",
          className
        )}>
          {ownerMenu}

          {/* Artwork + index */}
          <div className="flex-shrink-0 relative">
            <div className="w-full md:w-48 aspect-square overflow-hidden border-b-4 md:border-b-0 md:border-r-4 border-on-background">
              <StationThumbnail
                src={station.thumbnail}
                alt={station.name || "Station"}
                imgClassName="w-full h-full object-cover transition-all duration-300"
              />
              {displayIndex && (
                <div className="absolute top-0 left-0 bg-primary text-white font-black text-2xl px-3 py-1 border-r-4 border-b-4 border-on-background">
                  {displayIndex}
                </div>
              )}
            </div>
          </div>

          {/* Metadata */}
          <div className="flex-grow flex flex-col p-6 border-b-4 md:border-b-0 md:border-r-4 border-on-background">
            <div className="mb-4">
              <h2
                className="text-3xl font-black uppercase tracking-tight leading-none group-hover:text-primary transition-colors cursor-pointer font-headline"
                onClick={() => openStationSheet(station)}
              >
                {nameDisplay}
              </h2>
              <Link
                to="/station/$naddr"
                params={{ naddr: station.naddr }}
                className="text-sm font-bold text-outline uppercase tracking-widest hover:text-secondary-fixed-dim transition-colors"
              >
                /STATION/{station.stationId?.toUpperCase() || "UNKNOWN"}
              </Link>
            </div>
            <div className="mt-auto">
              <span className="text-[10px] uppercase font-black tracking-widest text-on-surface/50 block mb-1">
                MAINTAINER
              </span>
              <span className="text-sm font-bold uppercase">
                {(station.pubkey || "UNKNOWN").slice(0, 16).toUpperCase()}
              </span>
            </div>
          </div>

          {/* Tags */}
          <div className="md:w-64 p-6 flex flex-col border-b-4 md:border-b-0 md:border-r-4 border-on-background bg-surface-container-low">
            <span className="text-[10px] uppercase font-black tracking-widest mb-4">FREQUENCY_GENRE</span>
            <div className="flex flex-wrap gap-2">
              {station.genres?.slice(0, 5).map((genre, i) => (
                <span
                  key={i}
                  className={cn(
                    "px-2 py-1 text-[10px] font-bold uppercase cursor-pointer transition-colors hover:bg-primary hover:text-white",
                    i === 0
                      ? "bg-on-background text-surface"
                      : "border-2 border-on-background"
                  )}
                  onClick={() => toggleGenre(genre)}
                >
                  {genre.toUpperCase()}
                </span>
              ))}
            </div>
          </div>

          {/* Controls */}
          <div className="md:w-80 flex flex-col bg-surface-container-highest">
            {/* Social row */}
            <div className="flex border-b-4 border-on-background h-12">
              <button
                className="flex-1 flex items-center justify-center border-r-2 border-on-background hover:bg-secondary-fixed-dim transition-colors"
                onClick={handleCommentClick}
                title="Comment"
              >
                <span className={cn("material-symbols-outlined scale-75", userHasCommented && "text-primary")}>
                  chat_bubble
                </span>
              </button>
              <button
                className="flex-1 flex items-center justify-center border-r-2 border-on-background hover:bg-primary hover:text-white transition-colors"
                onClick={() => setShowZapDialog(true)}
                title="Zap"
              >
                <span className={cn("material-symbols-outlined scale-75", userHasZapped && "text-yellow-500")}>
                  bolt
                </span>
              </button>
              <button
                className="flex-1 flex items-center justify-center border-r-2 border-on-background hover:bg-secondary-fixed-dim transition-colors"
                onClick={handleShare}
                title="Share"
              >
                <span className="material-symbols-outlined scale-75">share</span>
              </button>
              <div className="flex-1 flex items-center justify-center">
                {favButton}
              </div>
            </div>
            {/* Play + visualizer */}
            <div className="flex-grow flex items-center p-4 gap-4">
              <button
                className="w-16 h-16 bg-primary text-white flex items-center justify-center border-4 border-on-background shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all shrink-0"
                onClick={handlePlayClick}
                title={
                  selectedStreamRequiresExternal
                    ? "Open stream source"
                    : isCurrentlyPlaying
                      ? "Pause"
                      : "Play"
                }
              >
                <span className="material-symbols-outlined text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                  {selectedStreamRequiresExternal
                    ? "open_in_new"
                    : isCurrentlyPlaying
                      ? "pause"
                      : "play_arrow"}
                </span>
              </button>
              <div className="min-w-0 flex-grow space-y-3">
                <div className="flex items-center justify-between gap-3">
                  {renderStreamBadge("min-w-0")}
                  {selectedStreamRequiresExternal && selectedStream?.url && (
                    <a
                      href={selectedStream.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0 text-[10px] font-black uppercase tracking-widest text-secondary-fixed-dim hover:text-primary"
                    >
                      Open Source
                    </a>
                  )}
                </div>
                <div className="flex items-end justify-between h-12 gap-1 px-2">
                  {([20, 60, 40, 80, 30, 50] as const).map((h, i) => (
                    <div
                      key={i}
                      className={cn(
                        "w-full transition-all",
                        i === 1 ? "bg-primary" : i === 4 ? "bg-secondary-fixed-dim" : "bg-on-background",
                        isCurrentlyPlaying && "animate-pulse"
                      )}
                      style={{ height: `${h}%` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {zapDialog}
      </>
    );
  }

  // ─── FEATURED-ITEM ────────────────────────────────────────────────────────────
  if (variant === "featured-item") {
    const bitrate = normalizeBitrate(selectedStream?.quality?.bitrate);

    return (
      <>
        <div
          className={cn(
            "group border-b-2 border-outline/30 py-2 flex items-center gap-3 hover:bg-secondary-fixed-dim/10 transition-colors cursor-pointer",
            className
          )}
          onClick={handlePlayClick}
        >
          {/* Index */}
          <span className="text-xs font-black text-outline shrink-0 w-5 text-right">{displayIndex ?? "—"}</span>

          {/* Thumbnail */}
          <div className="w-9 h-9 shrink-0 overflow-hidden border border-on-background/20">
            <StationThumbnail
              src={station.thumbnail}
              alt={station.name || "Station"}
              imgClassName="w-full h-full object-cover"
              iconSize="text-base"
            />
          </div>

          {/* Name + meta */}
          <div className="min-w-0 flex-1">
            <div ref={titleRef} className="overflow-hidden">
              {isMarquee ? (
                <div className="flex whitespace-nowrap animate-marquee">
                  <span className="text-sm font-bold tracking-tight uppercase group-hover:text-primary transition-colors font-headline pr-10">{nameDisplay}</span>
                  <span className="text-sm font-bold tracking-tight uppercase font-headline pr-10" aria-hidden>{nameDisplay}</span>
                </div>
              ) : (
                <span className="text-sm font-bold tracking-tight uppercase group-hover:text-primary transition-colors font-headline whitespace-nowrap">{nameDisplay}</span>
              )}
            </div>
            <div className="flex gap-2 text-[9px] uppercase font-bold text-outline leading-none mt-0.5">
              <span>{station.genres?.[0]?.toUpperCase() || "UNKNOWN"}</span>
              {bitrate && (
                <>
                  <span className="text-primary">•</span>
                  <span>{bitrate}K</span>
                </>
              )}
            </div>
          </div>

          {/* Quality bar */}
          <div onClick={(e) => e.stopPropagation()}>{renderQualitySelector("w-24")}</div>
        </div>

      </>
    );
  }

  // ─── SEARCH-RESULT ────────────────────────────────────────────────────────────
  if (variant === "search-result") {
    const cycle = (index ?? 0) % 3;
    const offsets    = ["md:translate-x-0",  "md:translate-x-12", "md:-translate-x-4"];
    const bgs        = ["bg-surface-container-low", "bg-surface-container-high", "bg-surface-container-low"];
    const hovers     = ["hover:bg-secondary-fixed-dim", "hover:bg-primary hover:text-white", "hover:bg-secondary-fixed-dim"];
    const isFirst    = (index ?? 0) === 0;
    const borderCls  = isFirst ? "border-4 border-on-background" : "border-x-4 border-b-4 border-on-background";

    return (
      <>
        <div
          className={cn(
            "group relative flex flex-col md:flex-row items-stretch cursor-pointer overflow-hidden transition-colors",
            borderCls, bgs[cycle], hovers[cycle], offsets[cycle],
            className
          )}
          style={{ zIndex: Math.max(1, 30 - (index ?? 0)) }}
        >
          {ownerMenu}

          {/* Index + thumbnail */}
          <div className="min-h-[6rem] bg-on-background text-surface flex items-center justify-center font-black text-4xl border-b-4 md:border-b-0 md:border-r-4 border-on-background px-4 shrink-0">
            {station.thumbnail && (
              <img
                src={station.thumbnail}
                alt={station.name || "Station"}
                className="w-12 h-12 object-cover grayscale mix-blend-screen opacity-60 mr-4 border border-surface/20 shrink-0"
              />
            )}
            <span>{displayIndex ?? "—"}</span>
          </div>

          {/* Station info */}
          <div className="px-8 py-4 flex-grow flex flex-col justify-center min-w-0 overflow-hidden" onClick={() => openStationSheet(station)}>
            <div ref={titleRef} className="overflow-hidden">
              {isMarquee ? (
                <div className="flex whitespace-nowrap animate-marquee">
                  <h3 className="text-2xl font-black uppercase font-headline pr-12">{nameDisplay}</h3>
                  <h3 className="text-2xl font-black uppercase font-headline pr-12" aria-hidden>{nameDisplay}</h3>
                </div>
              ) : (
                <h3 className="text-2xl font-black uppercase font-headline whitespace-nowrap">{nameDisplay}</h3>
              )}
            </div>
            <p className="text-xs font-bold text-tertiary uppercase tracking-widest opacity-70 whitespace-nowrap">
              {station.genres?.slice(0, 2).map(g => g.toUpperCase()).join(" / ") || "UNKNOWN_GENRE"}
              {normalizeBitrate(selectedStream?.quality?.bitrate)
                ? ` / ${normalizeBitrate(selectedStream?.quality?.bitrate)}K`
                : ""}
            </p>
          </div>

          {/* Quality bar */}
          <div className="px-8 py-4 hidden md:flex items-center gap-4 border-t-2 md:border-t-0 md:border-l-2 border-on-background/20 shrink-0">
            {renderQualitySelector("w-36")}
            <span
              className={cn("material-symbols-outlined", isCurrentlyPlaying ? "text-primary" : "text-secondary-fixed-dim")}
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              graphic_eq
            </span>
          </div>

          {/* Play + Social */}
          <div className="flex items-stretch border-t-2 md:border-t-0 md:border-l-2 border-on-background/20 overflow-x-auto scrollbar-none">
            <button
              className="px-5 flex items-center justify-center bg-on-background text-surface hover:bg-primary transition-colors border-r-2 border-on-background/20"
              onClick={handlePlayClick}
              title={
                selectedStreamRequiresExternal
                  ? "Open stream source"
                  : isCurrentlyPlaying
                    ? "Pause"
                    : "Play"
              }
            >
              <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                {selectedStreamRequiresExternal
                  ? "open_in_new"
                  : isCurrentlyPlaying
                    ? "pause"
                    : "play_arrow"}
              </span>
            </button>
            <button
              className="px-4 flex items-center justify-center hover:bg-primary hover:text-white transition-colors border-r-2 border-on-background/10"
              onClick={handleCommentClick} title="Comment"
            >
              <span className={cn("material-symbols-outlined text-xl", userHasCommented && "text-primary")}>comment</span>
            </button>
            <button
              className="px-4 flex items-center justify-center hover:bg-secondary-fixed-dim transition-colors border-r-2 border-on-background/10"
              onClick={handleLike} title={`Like${reactions > 0 ? ` (${reactions})` : ""}`}
            >
              <span className={cn("material-symbols-outlined text-xl", userHasReacted && "text-primary")} style={userHasReacted ? { fontVariationSettings: "'FILL' 1" } : {}}>
                favorite
              </span>
            </button>
            <button
              className="px-4 flex items-center justify-center hover:bg-secondary-fixed-dim transition-colors border-r-2 border-on-background/10"
              onClick={() => setShowZapDialog(true)} title={`Zap${zaps > 0 ? ` (${zaps})` : ""}`}
            >
              <span className={cn("material-symbols-outlined text-xl", userHasZapped && "text-yellow-500")}>bolt</span>
            </button>
            <button
              className="px-4 flex items-center justify-center hover:bg-primary hover:text-white transition-colors border-r-2 border-on-background/10"
              onClick={handleShare} title="Share"
            >
              <span className="material-symbols-outlined text-xl">share</span>
            </button>
            <div className="flex items-stretch">
              {isLoggedIn && station.pubkey && station.stationId ? (
                <FavoritesDropdown
                  station={station}
                  onAddToList={handleAddToList}
                  onRemoveFromList={handleRemoveFromList}
                  triggerClassName="px-4 h-full flex items-center justify-center hover:bg-primary hover:text-white transition-colors"
                />
              ) : (
                <div className="px-4 flex items-center justify-center opacity-30">
                  <span className="material-symbols-outlined text-xl">star</span>
                </div>
              )}
            </div>
          </div>

          {/* Status badge */}
          <div className={cn(
            "p-4 flex items-center justify-center font-bold uppercase text-[10px] tracking-tighter whitespace-nowrap shrink-0",
            isCurrentlyPlaying ? "bg-primary text-white" : "bg-on-background text-surface"
          )}>
            {station.streams.length > 1 ? (
              <StreamSelector
                streams={station.streams}
                selectedStreamUrl={selectedStream?.url}
                onStreamSelect={setSelectedStream}
                trigger={(
                  <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center justify-center gap-1 text-[10px] font-black uppercase tracking-widest"
                    title={selectedStreamRequiresExternal ? "Open stream at source" : "Select stream source"}
                  >
                    <span>{selectedStreamRequiresExternal ? "OPEN_SOURCE" : statusLabel}</span>
                    {selectedStreamRequiresExternal && (
                      <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                    )}
                    <span className="material-symbols-outlined text-[12px]">arrow_drop_down</span>
                  </button>
                )}
              />
            ) : (
              <span className="flex items-center gap-1">
                <span>{selectedStreamRequiresExternal ? "OPEN_SOURCE" : statusLabel}</span>
                {selectedStreamRequiresExternal && (
                  <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                )}
              </span>
            )}
          </div>
        </div>

        {zapDialog}
      </>
    );
  }

  // ─── LIST-COMPACT ─────────────────────────────────────────────────────────────
  return (
    <>
      <div className={cn(
        "group relative flex flex-col md:flex-row items-stretch bg-surface-container-low border-4 border-on-background hover:bg-secondary-fixed-dim transition-colors cursor-pointer overflow-hidden",
        className
      )}>
        {/* Index + thumbnail */}
        <div className="min-h-[6rem] bg-on-background text-surface flex items-center justify-center font-black text-4xl border-b-4 md:border-b-0 md:border-r-4 border-on-background px-4">
          {station.thumbnail && (
            <img
              src={station.thumbnail}
              alt={station.name || "Station"}
              className="w-12 h-12 object-cover grayscale mix-blend-screen opacity-60 mr-4 border border-surface/20 shrink-0"
            />
          )}
          <span>{displayIndex ?? "—"}</span>
        </div>

        {/* Station info */}
        <div className="px-8 py-4 flex-grow flex flex-col justify-center" onClick={() => openStationSheet(station)}>
          <h3 className="text-2xl font-black uppercase font-headline">{nameDisplay}</h3>
          <p className="text-xs font-bold text-tertiary uppercase tracking-widest">
            {station.genres?.slice(0, 2).map(g => g.toUpperCase()).join(" / ") || "UNKNOWN_GENRE"}
          </p>
        </div>

        {/* Quality bar */}
        <div className="px-8 py-4 hidden md:flex items-center gap-4 border-l-2 border-on-background/20">
          {renderQualitySelector("w-36")}
          <span
            className={cn("material-symbols-outlined", isCurrentlyPlaying ? "text-primary" : "text-secondary-fixed-dim")}
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            graphic_eq
          </span>
        </div>

        {/* Play */}
        <button
          className="px-6 flex items-center justify-center bg-on-background text-surface hover:bg-primary transition-colors border-l-4 border-on-background"
          onClick={handlePlayClick}
          title={
            selectedStreamRequiresExternal
              ? "Open stream source"
              : isCurrentlyPlaying
                ? "Pause"
                : "Play"
          }
        >
          <span className="material-symbols-outlined text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>
            {selectedStreamRequiresExternal
              ? "open_in_new"
              : isCurrentlyPlaying
                ? "pause"
                : "play_arrow"}
          </span>
        </button>

        {/* Social */}
        <div className="flex items-stretch border-l-2 border-on-background/20">
          <button
            className="px-4 flex items-center justify-center hover:bg-primary hover:text-white transition-colors border-r-2 border-on-background/10"
            onClick={handleCommentClick}
            title="Comment"
          >
            <span className={cn("material-symbols-outlined text-xl", userHasCommented && "text-primary")}>
              comment
            </span>
          </button>
          <button
            className="px-4 flex items-center justify-center hover:bg-secondary-fixed-dim transition-colors border-r-2 border-on-background/10"
            onClick={() => setShowZapDialog(true)}
            title="Zap"
          >
            <span className={cn("material-symbols-outlined text-xl", userHasZapped && "text-yellow-500")}>
              bolt
            </span>
          </button>
          <button
            className="px-4 flex items-center justify-center hover:bg-primary hover:text-white transition-colors border-r-2 border-on-background/10"
            onClick={handleShare}
            title="Share"
          >
            <span className="material-symbols-outlined text-xl">share</span>
          </button>
          <div className="px-4 flex items-center justify-center hover:bg-primary hover:text-white transition-colors">
            {favButton}
          </div>
        </div>

        {/* Status badge */}
        <div className={cn(
          "p-4 flex items-center justify-center font-bold uppercase text-[10px] tracking-tighter whitespace-nowrap",
          isCurrentlyPlaying ? "bg-primary text-white" : "bg-on-background text-surface"
        )}>
          {renderStreamBadge("border-current text-current")}
        </div>
      </div>
      {zapDialog}
    </>
  );
};
