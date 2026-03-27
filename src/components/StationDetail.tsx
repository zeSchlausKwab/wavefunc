import React, { useEffect, useState } from "react";
import { useNDKCurrentUser, useProfileValue } from "@nostr-dev-kit/react";
import type { NDKStation } from "../lib/NDKStation";
import { usePlayerStore } from "../stores/playerStore";
import { useSocialInteractions } from "../lib/hooks/useSocialInteractions";
import { useComments } from "../lib/hooks/useComments";
import { Comment } from "./Comment";
import { CommentForm } from "./CommentForm";
import { SectionHeader } from "./SectionHeader";
import { ZapDialog } from "./ZapDialog";
import { cn } from "../lib/utils";

interface StationDetailProps {
  station: NDKStation;
  focusCommentForm?: boolean;
  onCommentFormFocused?: () => void;
  /** Whether to add padding around the content. Default: true. Set to false for full-page layouts. */
  withPadding?: boolean;
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function PublisherBadge({ pubkey }: { pubkey: string }) {
  const profile = useProfileValue(pubkey);
  const displayName = profile?.name || profile?.displayName || pubkey.slice(0, 8).toUpperCase();

  return (
    <div className="flex items-center gap-2">
      <div className="w-7 h-7 shrink-0 border-2 border-on-background overflow-hidden bg-surface-container-high">
        {profile?.picture ? (
          <img
            src={profile.picture}
            alt={displayName}
            className="w-full h-full object-cover grayscale contrast-125"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="material-symbols-outlined text-[14px] text-on-background/40">person</span>
          </div>
        )}
      </div>
      <span className="text-[10px] font-bold uppercase tracking-widest text-on-background/50 truncate">
        {displayName}
      </span>
    </div>
  );
}

/**
 * StationDetail - Reusable component for displaying full station details
 * Can be used in both sheets/modals and full-page routes
 */
export const StationDetail: React.FC<StationDetailProps> = ({
  station,
  focusCommentForm = false,
  onCommentFormFocused,
  withPadding = true,
}) => {
  const currentUser = useNDKCurrentUser();
  const { currentStation, isPlaying, playStation, pause } = usePlayerStore();
  const {
    reactions,
    zaps,
    comments: socialComments,
    userHasReacted,
    userHasZapped,
    userHasCommented,
  } = useSocialInteractions(station);

  const [selectedStream, setSelectedStream] = React.useState(
    station.streams.find((s) => s.primary) || station.streams[0]
  );
  const [showZapDialog, setShowZapDialog] = useState(false);
  const [showStreams, setShowStreams] = useState(false);
  const commentFormRef = React.useRef<HTMLTextAreaElement>(null);

  const isCurrentStation = currentStation?.id === station.id;
  const isCurrentlyPlaying = isCurrentStation && isPlaying;

  const { comments, totalCount } = useComments(station);

  useEffect(() => {
    if (focusCommentForm && commentFormRef.current) {
      const timer = setTimeout(() => {
        commentFormRef.current?.focus();
        onCommentFormFocused?.();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [focusCommentForm, onCommentFormFocused]);

  const handlePlayClick = () => {
    if (isCurrentlyPlaying) pause();
    else playStation(station, selectedStream);
  };

  const handleLike = async () => {
    if (!currentUser) return;
    await station.react("❤️", true);
  };

  const handleRootComment = async (content: string) => {
    if (!currentUser) {
      alert("Please log in to comment on stations");
      return;
    }
    try {
      const reply = station.reply(true);
      reply.content = content;
      await reply.publish();
    } catch (error) {
      console.error("Error posting comment:", error);
      throw error;
    }
  };

  const sortedStreams = [...station.streams].sort(
    (a, b) => (b.quality?.bitrate || 0) - (a.quality?.bitrate || 0)
  );

  const websiteHostname = (() => {
    try {
      return station.website ? new URL(station.website).hostname : null;
    } catch {
      return station.website || null;
    }
  })();

  return (
    <div className="w-full">

      {/* ── Banner ── */}
      <div className="relative w-full aspect-video overflow-hidden bg-on-background group">
        {station.thumbnail ? (
          <img
            src={station.thumbnail}
            alt={station.name || "Station"}
            className="w-full h-full object-cover grayscale contrast-125 group-hover:grayscale-0 transition-all duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="material-symbols-outlined text-[96px] text-surface/10">radio</span>
          </div>
        )}

        {/* On-air badge */}
        {isCurrentlyPlaying && (
          <div className="absolute top-4 left-4 bg-primary text-white text-[10px] font-black uppercase tracking-widest px-2 py-0.5 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            ON_AIR
          </div>
        )}

        {/* Play/pause overlay button */}
        <button
          onClick={handlePlayClick}
          className={cn(
            "absolute bottom-4 right-4 w-16 h-16 border-4 border-on-background flex items-center justify-center shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none",
            isCurrentlyPlaying ? "bg-primary text-white" : "bg-surface text-on-background"
          )}
          title={isCurrentlyPlaying ? "Pause" : "Play"}
        >
          <span
            className="material-symbols-outlined text-3xl"
            style={isCurrentlyPlaying ? { fontVariationSettings: "'FILL' 1" } : {}}
          >
            {isCurrentlyPlaying ? "pause" : "play_arrow"}
          </span>
        </button>
      </div>

      {/* ── Content ── */}
      <div className={cn("space-y-6", withPadding ? "p-6" : "pt-6")}>

        {/* Station name + publisher + description */}
        <div>
          <h1 className="text-3xl sm:text-5xl font-black uppercase tracking-tighter leading-none mb-3 font-headline">
            {station.name || "UNNAMED_STATION"}
          </h1>
          <PublisherBadge pubkey={station.pubkey} />
          {station.description && (
            <p className="mt-3 text-sm font-bold uppercase tracking-wider text-on-background/60 leading-relaxed">
              {station.description}
            </p>
          )}
        </div>

        {/* Genres */}
        {station.genres && station.genres.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {station.genres.map((genre) => (
              <span
                key={genre}
                className="text-[10px] font-black uppercase tracking-widest px-2 py-1 border-2 border-on-background bg-surface-container-low"
              >
                {genre}
              </span>
            ))}
          </div>
        )}

        {/* Info panel */}
        {(station.location || (station.languages && station.languages.length > 0) || websiteHostname) && (
          <div className="border-4 border-on-background bg-surface-container-low divide-y-4 divide-on-background">
            {station.location && (
              <div className="flex items-center gap-3 px-4 py-2.5">
                <span className="material-symbols-outlined text-[18px] shrink-0 text-on-background/50">location_on</span>
                <span className="text-[11px] font-bold uppercase tracking-wider truncate">{station.location}</span>
              </div>
            )}
            {station.languages && station.languages.length > 0 && (
              <div className="flex items-center gap-3 px-4 py-2.5">
                <span className="material-symbols-outlined text-[18px] shrink-0 text-on-background/50">translate</span>
                <span className="text-[11px] font-bold uppercase tracking-wider truncate">
                  {station.languages.join(" / ")}
                </span>
              </div>
            )}
            {websiteHostname && station.website && (
              <div className="flex items-center gap-3 px-4 py-2.5">
                <span className="material-symbols-outlined text-[18px] shrink-0 text-on-background/50">language</span>
                <a
                  href={station.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-bold uppercase tracking-wider truncate text-primary hover:text-on-background transition-colors flex items-center gap-1"
                >
                  {websiteHostname}
                  <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                </a>
              </div>
            )}
          </div>
        )}

        {/* Stream quality selector */}
        {sortedStreams.length > 1 && (
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-on-background/40 mb-2">
              SIGNAL_QUALITY
            </div>
            <div className="flex flex-wrap gap-2">
              {sortedStreams.map((stream) => {
                const codec = stream.quality?.codec?.toUpperCase() || "STREAM";
                const bitrate = stream.quality?.bitrate
                  ? `${Math.round(stream.quality.bitrate / 1000)}K`
                  : null;
                const isSelected = selectedStream?.url === stream.url;
                return (
                  <button
                    key={stream.url}
                    onClick={() => setSelectedStream(stream)}
                    className={cn(
                      "text-[10px] font-black uppercase tracking-widest px-3 py-1.5 border-2 border-on-background transition-colors",
                      isSelected
                        ? "bg-on-background text-surface"
                        : "bg-surface-container-low hover:bg-surface-container-high"
                    )}
                  >
                    {codec}{bitrate ? ` ${bitrate}` : ""}
                    {stream.primary && (
                      <span className={cn("ml-1", isSelected ? "text-surface/60" : "text-primary")}>★</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Social actions bar */}
        <div className="border-t-4 border-on-background pt-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={handleLike}
              className="flex items-center gap-1 hover:text-primary transition-colors"
              title="Resonate"
            >
              <span
                className={cn("material-symbols-outlined text-[18px]", userHasReacted && "text-primary")}
                style={userHasReacted ? { fontVariationSettings: "'FILL' 1" } : {}}
              >
                favorite
              </span>
              {reactions > 0 && (
                <span className="text-[11px] font-bold">{formatCount(reactions)}</span>
              )}
            </button>

            <button
              onClick={() => setShowZapDialog(true)}
              className="flex items-center gap-1 hover:text-secondary-fixed-dim transition-colors"
              title="Zap"
            >
              <span
                className={cn("material-symbols-outlined text-[18px]", userHasZapped && "text-secondary-fixed-dim")}
                style={userHasZapped ? { fontVariationSettings: "'FILL' 1" } : {}}
              >
                bolt
              </span>
              {zaps > 0 && (
                <span className="text-[11px] font-bold">{formatCount(zaps)}</span>
              )}
            </button>

            <button
              className="flex items-center gap-1 hover:text-primary transition-colors"
              title="Comment"
              onClick={() => commentFormRef.current?.focus()}
            >
              <span
                className={cn("material-symbols-outlined text-[18px]", userHasCommented && "text-primary")}
                style={userHasCommented ? { fontVariationSettings: "'FILL' 1" } : {}}
              >
                comment
              </span>
              {socialComments > 0 && (
                <span className="text-[11px] font-bold">{formatCount(socialComments)}</span>
              )}
            </button>
          </div>

          <button
            onClick={() => {
              navigator.clipboard?.writeText(
                `${window.location.origin}/station/${station.naddr}`
              );
            }}
            className="text-on-background/40 hover:text-on-background transition-colors"
            title="Share"
          >
            <span className="material-symbols-outlined text-[18px]">share</span>
          </button>
        </div>

        {/* Comments section */}
        <div className="space-y-4">
          <SectionHeader label={totalCount > 0 ? `${totalCount}_SIGNALS` : undefined}>
            COMMENTS
          </SectionHeader>

          {comments.length === 0 ? (
            <div className="border-4 border-on-background p-8 bg-surface-container-low flex flex-col items-center gap-3">
              <span className="material-symbols-outlined text-4xl text-on-background/20">chat_bubble</span>
              <span className="text-[11px] font-black uppercase tracking-widest text-on-background/40 text-center">
                NO_SIGNALS_YET — BE_THE_FIRST
              </span>
            </div>
          ) : (
            <div className="space-y-4">
              {comments.map((commentNode) => (
                <Comment
                  key={commentNode.event.id}
                  commentNode={commentNode}
                  stationAddress={station.address}
                  stationId={station.id}
                />
              ))}
            </div>
          )}

          <CommentForm
            ref={commentFormRef}
            onSubmit={handleRootComment}
            placeholder="Transmit your signal..."
          />
        </div>

        {/* Stream endpoints (debug) */}
        {sortedStreams.length > 0 && (
          <div className="border-t-4 border-on-background/20 pt-4">
            <button
              onClick={() => setShowStreams(!showStreams)}
              className="flex items-center justify-between w-full text-[10px] font-black uppercase tracking-widest text-on-background/40 hover:text-on-background transition-colors"
            >
              <span>STREAM_ENDPOINTS ({sortedStreams.length})</span>
              <span className="material-symbols-outlined text-[16px]">
                {showStreams ? "expand_less" : "expand_more"}
              </span>
            </button>

            {showStreams && (
              <div className="mt-3 space-y-2">
                {sortedStreams.map((stream, i) => (
                  <div key={i} className="border-2 border-on-background/20 bg-surface-container-low p-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 border border-on-background/30 bg-surface">
                        {stream.quality?.codec?.toUpperCase() || "?"}
                      </span>
                      {stream.quality?.bitrate && (
                        <span className="text-[10px] font-bold text-on-background/50">
                          {Math.round(stream.quality.bitrate / 1000)}KBPS
                        </span>
                      )}
                      {stream.primary && (
                        <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                          PRIMARY
                        </span>
                      )}
                    </div>
                    <a
                      href={stream.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-mono text-primary hover:text-on-background transition-colors break-all"
                    >
                      {stream.url}
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      <ZapDialog
        station={station}
        open={showZapDialog}
        onOpenChange={setShowZapDialog}
        onZap={async (_amount: number) => {}}
      />
    </div>
  );
};
