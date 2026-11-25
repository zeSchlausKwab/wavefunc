import { Link } from "@tanstack/react-router";
import { stationGenres } from "../lib/genres";
import React, { useEffect, useState } from "react";
import {
  buildStationCommentTemplate,
  buildStationReactionTemplate,
  type ParsedStation,
} from "../lib/nostr/domain";
import { useCurrentAccount, useProfile } from "../lib/nostr/auth";
import { useWavefuncNostr } from "../lib/nostr/runtime";
import { usePlayerStore } from "../stores/playerStore";
import { SocialCount } from "./SocialCount";
import { useSocialInteractions } from "../lib/hooks/useSocialInteractions";
import { useComments } from "../lib/hooks/useComments";
import { useFavorites } from "../lib/hooks/useFavorites";
import { FavoritesDropdown } from "./FavoritesDropdown";
import { Comment } from "./Comment";
import { CommentForm } from "./CommentForm";
import { StationTrackHistory } from "./StationTrackHistory";
import { ExternalLink, Pause, Play } from "lucide-react";
import { StreamSelector } from "./StreamSelector";
import { ZapDialog } from "./ZapDialog";
import { cn } from "../lib/utils";
import {
  canPlayStreamInApp,
  getDefaultSelectedStream,
  openStreamExternally,
} from "../lib/player/adapters";
import { useStationHealth } from "../lib/nostr/hooks/useStationObservations";
import { StationHealthBadge } from "./StationHealthBadge";
import { StationReportDialog } from "./StationReportDialog";
import { StationShareDialog } from "./StationShareDialog";

interface StationDetailProps {
  station: ParsedStation;
  focusCommentForm?: boolean;
  onCommentFormFocused?: () => void;
  linkGenres?: boolean;
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function normalizeBitrate(bitrate?: number): number | null {
  if (!bitrate || bitrate <= 0) return null;
  return bitrate >= 1000 ? Math.round(bitrate / 1000) : Math.round(bitrate);
}

function PublisherBadge({ pubkey }: { pubkey: string }) {
  const profile = useProfile(pubkey);
  const displayName = profile?.name || profile?.display_name || pubkey.slice(0, 8).toUpperCase();

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
  linkGenres = false,
}) => {
  const currentUser = useCurrentAccount();
  const { signAndPublish } = useWavefuncNostr();
  const { currentStation, isPlaying, playStation, pause } = usePlayerStore();
  const { addFavorite, removeFavorite, isLoggedIn } = useFavorites();
  const {
    reactions,
    zaps,
    comments: socialComments,
    commentCountRelay,
    commentCountApproximate,
    commentCountFresh,
    commentCountLowerBound,
    userHasReacted,
    userHasZapped,
    userHasCommented,
  } = useSocialInteractions(station.event);

  const [selectedStream, setSelectedStream] = React.useState(() =>
    getDefaultSelectedStream(station.streams)
  );
  const [showZapDialog, setShowZapDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showStreams, setShowStreams] = useState(false);
  const commentFormRef = React.useRef<HTMLTextAreaElement>(null);

  const isCurrentStation = currentStation?.id === station.id;
  const isCurrentlyPlaying = isCurrentStation && isPlaying;
  const selectedStreamRequiresExternal =
    selectedStream ? !canPlayStreamInApp(selectedStream) : false;

  const { comments, totalCount, isLoading: commentsLoading, error: commentsError } = useComments(station.event);
  const { byAddress: healthByAddress } = useStationHealth(
    station.address ? [station.address] : [],
  );
  const health = station.address ? healthByAddress.get(station.address) : undefined;

  useEffect(() => {
    if (focusCommentForm && commentFormRef.current) {
      const timer = setTimeout(() => {
        commentFormRef.current?.focus();
        onCommentFormFocused?.();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [focusCommentForm, onCommentFormFocused]);

  useEffect(() => {
    setSelectedStream(getDefaultSelectedStream(station.streams));
  }, [station.id, station.content]);

  const handlePlayClick = () => {
    if (selectedStream?.url && selectedStreamRequiresExternal) {
      openStreamExternally(selectedStream.url);
      return;
    }
    if (isCurrentlyPlaying) pause();
    else playStation(station, selectedStream);
  };

  const handleLike = async () => {
    if (!currentUser) return;
    await signAndPublish(buildStationReactionTemplate(station.event));
  };

  const handleRootComment = async (content: string) => {
    if (!currentUser) {
      alert("Please log in to comment on stations");
      return;
    }
    try {
      await signAndPublish(buildStationCommentTemplate(station.event, content));
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

  const playLabel = selectedStreamRequiresExternal ? "Open stream source" : isCurrentlyPlaying ? "Pause" : "Play";

  return (
    <div className="@container/station w-full">
      <div className="grid border-4 border-on-background bg-surface @min-[48rem]/station:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">

        {/* ── LEFT COLUMN: Banner · Title · Description · Social ── */}
        <div className="min-w-0 border-b-4 border-on-background @min-[48rem]/station:border-r-4 @min-[48rem]/station:border-b-0">

          {/* Banner */}
          <div className="relative w-full aspect-video max-h-80 overflow-hidden border-b-4 border-on-background bg-on-background group">
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
            {isCurrentlyPlaying && (
              <div className="absolute top-4 left-4 bg-primary text-white text-[10px] font-black uppercase tracking-widest px-2 py-0.5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                ON_AIR
              </div>
            )}
            {!isCurrentlyPlaying && health && (
              <StationHealthBadge health={health} className="absolute left-4 top-4" />
            )}
            <button
              onClick={handlePlayClick}
              className={cn(
                "absolute bottom-4 right-4 w-16 h-16 border-4 border-on-background flex items-center justify-center shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none",
                isCurrentlyPlaying ? "bg-primary text-white" : "bg-surface text-on-background"
              )}
              title={playLabel}
              aria-label={playLabel + " " + (station.name || "station")}
            >
              {selectedStreamRequiresExternal ? <ExternalLink aria-hidden="true" /> : isCurrentlyPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
            </button>
          </div>

          {/* Station name · publisher · description · genres */}
          <div className="space-y-4 p-4 sm:p-5">
            <div>
              <h1 className="text-3xl sm:text-4xl break-words font-black uppercase tracking-tighter leading-none mb-3 font-headline">
                {station.name || "UNNAMED_STATION"}
              </h1>
              <PublisherBadge pubkey={station.pubkey} />
              {station.description && (
                <p className="mt-3 break-words text-sm font-bold uppercase tracking-wider text-on-background/60 leading-relaxed">
                  {station.description}
                </p>
              )}
            </div>

            {station.genres && station.genres.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {stationGenres(station.genres).map(genre => (
                  <span key={genre.slug} className="text-[10px] font-black uppercase tracking-widest px-2 py-1 border-2 border-on-background bg-surface-container-low">
                    {linkGenres
                      ? <Link to="/genre/$slug" params={{ slug: genre.slug }} className="underline">{genre.name}</Link>
                      : genre.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Social actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-on-background bg-surface-container-low px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center gap-4">
              <button onClick={handleLike} className="flex items-center gap-1 hover:text-primary transition-colors" title="Resonate">
                <span className={cn("material-symbols-outlined text-[18px]", userHasReacted && "text-primary")} style={userHasReacted ? { fontVariationSettings: "'FILL' 1" } : {}}>favorite</span>
                {reactions > 0 && <span className="text-[11px] font-bold">{formatCount(reactions)}</span>}
              </button>
              <button onClick={() => setShowZapDialog(true)} className="flex items-center gap-1 hover:text-secondary-fixed-dim transition-colors" title="Zap">
                <span className={cn("material-symbols-outlined text-[18px]", userHasZapped && "text-secondary-fixed-dim")} style={userHasZapped ? { fontVariationSettings: "'FILL' 1" } : {}}>bolt</span>
                {zaps > 0 && <span className="text-[11px] font-bold">{formatCount(zaps)}</span>}
              </button>
              <button className="flex items-center gap-1 hover:text-primary transition-colors" title="Comment" onClick={() => commentFormRef.current?.focus()}>
                <span className={cn("material-symbols-outlined text-[18px]", userHasCommented && "text-primary")} style={userHasCommented ? { fontVariationSettings: "'FILL' 1" } : {}}>comment</span>
                <SocialCount count={socialComments} source={commentCountRelay} approximate={commentCountApproximate} fresh={commentCountFresh} lowerBound={commentCountLowerBound} />
              </button>
              {isLoggedIn && station.pubkey && station.stationId && (
                <FavoritesDropdown
                  station={station}
                  onAddToList={async (listId) => { await addFavorite(station, listId); }}
                  onRemoveFromList={async () => { await removeFavorite(station); }}
                  triggerClassName="flex items-center justify-center hover:text-primary transition-colors"
                  iconSize="text-[18px]"
                />
              )}
              <StationReportDialog station={station} />
            </div>
            <button
              onClick={() => setShowShareDialog(true)}
              className="text-on-background/40 hover:text-on-background transition-colors"
              title="Share"
              aria-label={`Share ${station.name || "station"}`}
            >
              <span className="material-symbols-outlined text-[18px]">share</span>
            </button>
          </div>
          {station.address && <StationTrackHistory address={station.address} />}
        </div>

        {/* ── RIGHT COLUMN: Info · Streams · Comments ── */}
        <div className="min-w-0">
          <div className="space-y-5 p-4 sm:p-5">

            {/* Info panel */}
            {(station.location || (station.languages && station.languages.length > 0) || websiteHostname) && (
              <div className="border-2 border-on-background bg-surface-container-low divide-y-2 divide-on-background">
                {station.location && (
                  <div className="flex items-center gap-3 px-4 py-2.5">
                    <span className="material-symbols-outlined text-[18px] shrink-0 text-on-background/50">location_on</span>
                    <span className="text-[11px] font-bold uppercase tracking-wider truncate">{station.location}</span>
                  </div>
                )}
                {station.languages && station.languages.length > 0 && (
                  <div className="flex items-center gap-3 px-4 py-2.5">
                    <span className="material-symbols-outlined text-[18px] shrink-0 text-on-background/50">translate</span>
                    <span className="text-[11px] font-bold uppercase tracking-wider truncate">{station.languages.join(" / ")}</span>
                  </div>
                )}
                {websiteHostname && station.website && (
                  <div className="flex items-center gap-3 px-4 py-2.5">
                    <span className="material-symbols-outlined text-[18px] shrink-0 text-on-background/50">language</span>
                    <a href={station.website} target="_blank" rel="noopener noreferrer" className="min-w-0 break-all text-[11px] font-bold uppercase tracking-wider text-primary hover:underline">
                      {websiteHostname}
                      <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Stream quality selector */}
            {sortedStreams.length > 0 && (
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-on-background/40 mb-2">
                  Signal Route
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {sortedStreams.length > 1 ? (
                    <StreamSelector
                      streams={sortedStreams}
                      selectedStreamUrl={selectedStream?.url}
                      onStreamSelect={setSelectedStream}
                      align="start"
                      trigger={(
                        <button
                          type="button"
                          className={cn(
                            "inline-flex items-center gap-2 border-2 px-3 py-2 text-[10px] font-black uppercase tracking-[0.22em]",
                            selectedStreamRequiresExternal
                              ? "border-secondary-fixed-dim text-secondary-fixed-dim"
                              : "border-on-background bg-surface-container-low"
                          )}
                        >
                          <span>
                            {selectedStream?.quality?.codec?.toUpperCase() || "STREAM"}
                            {normalizeBitrate(selectedStream?.quality?.bitrate)
                              ? ` ${normalizeBitrate(selectedStream?.quality?.bitrate)}K`
                              : ""}
                          </span>
                          {selectedStreamRequiresExternal && (
                            <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                          )}
                          <span className="material-symbols-outlined text-[14px]">arrow_drop_down</span>
                        </button>
                      )}
                    />
                  ) : (
                    <div
                      className={cn(
                        "inline-flex items-center gap-2 border-2 px-3 py-2 text-[10px] font-black uppercase tracking-[0.22em]",
                        selectedStreamRequiresExternal
                          ? "border-secondary-fixed-dim text-secondary-fixed-dim"
                          : "border-on-background bg-surface-container-low"
                      )}
                    >
                      <span>
                        {selectedStream?.quality?.codec?.toUpperCase() || "STREAM"}
                        {normalizeBitrate(selectedStream?.quality?.bitrate)
                          ? ` ${normalizeBitrate(selectedStream?.quality?.bitrate)}K`
                          : ""}
                      </span>
                      {selectedStreamRequiresExternal && (
                        <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                      )}
                    </div>
                  )}
                  <span className="text-[10px] font-black uppercase tracking-widest text-on-background/50">
                    {selectedStreamRequiresExternal ? "Opens At Source" : "Plays In App"}
                  </span>
                  {selectedStreamRequiresExternal && selectedStream?.url && (
                    <a
                      href={selectedStream.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-primary hover:text-on-background"
                    >
                      Open Stream
                      <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Comments */}
            <div className="space-y-4">
              <h2 className="flex items-baseline gap-2 font-headline text-xl font-black uppercase tracking-tight">
                Comments {totalCount > 0 && <span className="text-sm text-primary">({totalCount})</span>}
              </h2>
              {commentsError && <p role="status" className="text-sm">Some comments could not be loaded. Cached comments are shown.</p>}
              {commentsLoading && <p className="text-sm">Loading comments…</p>}
              {comments.length === 0 && !commentsLoading ? (
                <div className="flex items-center gap-3 border-2 border-on-background bg-surface-container-low p-3">
                  <span className="material-symbols-outlined text-xl text-on-background/50">chat_bubble</span>
                  <span className="text-sm font-medium text-on-background/70">No comments yet.</span>
                </div>
              ) : (
                <div className="space-y-4">
                  {comments.map((commentNode) => (
                    <Comment key={commentNode.event.id} commentNode={commentNode} stationAddress={station.address!} stationId={station.id} />
                  ))}
                </div>
              )}
              <CommentForm ref={commentFormRef} onSubmit={handleRootComment} placeholder="Transmit your signal..." />
            </div>

            {/* Stream endpoints */}
            {sortedStreams.length > 0 && (
              <div className="border-2 border-on-background/40 p-3">
                <button
                  onClick={() => setShowStreams(!showStreams)}
                  aria-expanded={showStreams}
                  className="flex items-center justify-between w-full text-[10px] font-black uppercase tracking-widest text-on-background/40 hover:text-on-background transition-colors"
                >
                  <span>STREAM_ENDPOINTS ({sortedStreams.length})</span>
                  <span className="material-symbols-outlined text-[16px]">{showStreams ? "expand_less" : "expand_more"}</span>
                </button>
                {showStreams && (
                  <div className="mt-3 space-y-2">
                    {sortedStreams.map((stream, i) => (
                      <div key={i} className="border-2 border-on-background/20 bg-surface-container-low p-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 border border-on-background/30 bg-surface">
                            {stream.quality?.codec?.toUpperCase() || "?"}
                          </span>
                          {normalizeBitrate(stream.quality?.bitrate) && (
                            <span className="text-[10px] font-bold text-on-background/50">
                              {normalizeBitrate(stream.quality?.bitrate)}KBPS
                            </span>
                          )}
                          {stream.primary && <span className="text-[10px] font-black uppercase tracking-widest text-primary">PRIMARY</span>}
                        </div>
                        <a href={stream.url} target="_blank" rel="noopener noreferrer" className="text-[10px] font-mono text-primary hover:text-on-background transition-colors break-all">
                          {stream.url}
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>

      </div>

      <ZapDialog
        station={station}
        open={showZapDialog}
        onOpenChange={setShowZapDialog}
        onZap={async (_amount: number) => {}}
      />
      <StationShareDialog
        station={station}
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
      />
    </div>
  );
};
