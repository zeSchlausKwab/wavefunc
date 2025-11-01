import {
  ExternalLink,
  Globe,
  Languages,
  MapPin,
  Radio,
  Play,
  Pause,
} from "lucide-react";
import React, { useEffect } from "react";
import type { NDKStation } from "../lib/NDKStation";
import { usePlayerStore } from "../stores/playerStore";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { StreamSelector } from "./StreamSelector";
import { SocialActions } from "./SocialActions";
import { useComments } from "../lib/hooks/useComments";
import { Comment } from "./Comment";
import { CommentForm } from "./CommentForm";
import { useNDKCurrentUser } from "@nostr-dev-kit/react";
import { MessageCircleIcon } from "./ui/icons/lucide-message-circle";
import { UserAvatar } from "./UserAvatar";

interface StationDetailProps {
  station: NDKStation;
  focusCommentForm?: boolean;
  onCommentFormFocused?: () => void;
  /** Whether to add padding around the content. Default: true. Set to false for full-page layouts. */
  withPadding?: boolean;
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
  const [selectedStream, setSelectedStream] = React.useState(
    station.streams.find((s) => s.primary) || station.streams[0]
  );
  const commentFormRef = React.useRef<HTMLTextAreaElement>(null);

  const isCurrentStation = currentStation?.id === station.id;
  const isCurrentlyPlaying = isCurrentStation && isPlaying;

  // Fetch comments using the useComments hook
  const { comments, totalCount } = useComments(station);

  // Handle focus when focusCommentForm prop changes
  useEffect(() => {
    if (focusCommentForm && commentFormRef.current) {
      // Small delay to ensure rendering completes
      const timer = setTimeout(() => {
        commentFormRef.current?.focus();
        onCommentFormFocused?.();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [focusCommentForm, onCommentFormFocused]);

  const handlePlayClick = () => {
    if (isCurrentlyPlaying) {
      pause();
    } else {
      playStation(station, selectedStream);
    }
  };

  const handleRootComment = async (content: string) => {
    if (!currentUser) {
      alert("Please log in to comment on stations");
      return;
    }

    try {
      const reply = station.reply(true); // forceNip22 = true
      reply.content = content;
      await reply.publish();
      console.log("Posted root comment on station:", station.name);
    } catch (error) {
      console.error("Error posting comment:", error);
      throw error;
    }
  };

  return (
    <div className={"w-full"}>
      {/* Header with Thumbnail */}
      <div className="relative">
        {station.thumbnail ? (
          <div className="w-full aspect-video overflow-hidden bg-gray-100">
            <img
              src={station.thumbnail}
              alt={station.name || "Station"}
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div className="w-full aspect-video bg-secondary flex items-center justify-center">
            <Radio className="w-32 h-32 text-muted-foreground/20" />
          </div>
        )}

        {/* Play Button Overlay */}
        <div className="absolute bottom-4 right-4">
          <Button
            onClick={handlePlayClick}
            className={`rounded-full w-16 h-16 shadow-lg ${
              isCurrentlyPlaying
                ? "bg-blue-600 hover:bg-blue-700"
                : "bg-white hover:bg-gray-100"
            }`}
            title={isCurrentlyPlaying ? "Pause" : "Play"}
          >
            {isCurrentlyPlaying ? (
              <Pause className="w-8 h-8 text-white" />
            ) : (
              <Play className="w-8 h-8 text-gray-900" />
            )}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className={`space-y-6 ${withPadding ? "p-6" : ""}`}>
        {/* Title and Description */}
        <div>
          <h1 className="text-2xl font-bold">
            {station.name || "Unnamed Station"}
          </h1>
          <UserAvatar pubkey={station.pubkey} mode="full-profile" />
          {station.description && (
            <p className="text-base text-muted-foreground mt-2">
              {station.description}
            </p>
          )}
        </div>

        {/* Genres */}
        {station.genres && station.genres.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Genres</h3>
            <div className="flex flex-wrap gap-2">
              {station.genres.map((genre, index) => (
                <Badge key={index} variant="secondary">
                  {genre}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Stream Quality Selector */}
        {station.streams && station.streams.length > 1 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              Stream Quality
            </h3>
            <StreamSelector
              streams={station.streams}
              selectedStreamUrl={selectedStream?.url}
              onStreamSelect={setSelectedStream}
              className="w-full justify-start px-3 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200"
            />
          </div>
        )}

        {/* Station Information */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">
            Information
          </h3>

          {/* Location */}
          {station.location && (
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-900">Location</p>
                <p className="text-sm text-gray-600">{station.location}</p>
              </div>
            </div>
          )}

          {/* Languages */}
          {station.languages && station.languages.length > 0 && (
            <div className="flex items-start gap-3">
              <Languages className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-900">Languages</p>
                <p className="text-sm text-gray-600">
                  {station.languages.join(", ")}
                </p>
              </div>
            </div>
          )}

          {/* Homepage */}
          {station.website && (
            <div className="flex items-start gap-3">
              <Globe className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-900">Website</p>
                <a
                  href={station.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  {new URL(station.website).hostname}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Social Actions */}
        <div className="pt-4 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Interact</h3>
            <SocialActions station={station} />
          </div>
        </div>

        {/* Comments Section (NIP-22 Threaded Comments) */}
        <div className="pt-4 border-t border-gray-200">
          <div className="flex items-center gap-2 mb-4">
            <MessageCircleIcon className="w-5 h-5 text-green-500" />
            <h3 className="text-sm font-semibold text-gray-700">
              Comments {totalCount > 0 && `(${totalCount})`}
            </h3>
          </div>

          {/* Comments Thread */}
          <div className="space-y-4 mb-4">
            {comments.length === 0 ? (
              <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                <MessageCircleIcon className="w-12 h-12 mx-auto mb-2 opacity-20" />
                <p className="text-sm font-medium">No comments yet</p>
                <p className="text-xs mt-1">
                  Be the first to share your thoughts
                </p>
              </div>
            ) : (
              comments.map((commentNode) => (
                <Comment
                  key={commentNode.event.id}
                  commentNode={commentNode}
                  stationAddress={station.address}
                  stationId={station.id}
                />
              ))
            )}
          </div>

          {/* Root Comment Form (always visible) */}
          <CommentForm
            ref={commentFormRef}
            onSubmit={handleRootComment}
            placeholder="Share your thoughts about this station..."
          />
        </div>

        {/* Stream URLs (for debugging/advanced users) */}
        {station.streams && station.streams.length > 0 && (
          <div className="pt-4 border-t border-gray-200">
            <details className="group">
              <summary className="text-sm font-semibold text-gray-700 cursor-pointer list-none flex items-center justify-between">
                <span>Stream URLs ({station.streams.length})</span>
                <span className="text-gray-400 group-open:rotate-180 transition-transform">
                  ▼
                </span>
              </summary>
              <div className="mt-3 space-y-2">
                {station.streams.map((stream, index) => (
                  <div
                    key={index}
                    className="p-3 bg-gray-50 rounded-md text-xs font-mono break-all"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-xs">
                        {stream.quality?.codec?.toUpperCase() || "Unknown"}
                      </Badge>
                      {stream.quality?.bitrate && (
                        <span className="text-gray-600">
                          {Math.round(stream.quality.bitrate / 1000)}kbps
                        </span>
                      )}
                      {stream.primary && (
                        <Badge variant="default" className="text-xs">
                          Primary
                        </Badge>
                      )}
                    </div>
                    <a
                      href={stream.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-700"
                    >
                      {stream.url}
                    </a>
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  );
};
