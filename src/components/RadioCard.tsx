import { useNDKCurrentUser } from "@nostr-dev-kit/react";
import {
  Edit3,
  MoreVertical,
  Pause,
  Play,
  Radio,
  ExternalLink,
  Trash2,
} from "lucide-react";
import React, { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useFavorites } from "../lib/hooks/useFavorites";
import { NDKStation, type Stream } from "../lib/NDKStation";
import { usePlayerStore } from "../stores/playerStore";
import { useFilterStore } from "../stores/filterStore";
import { FavoritesDropdown } from "./FavoritesDropdown";
import { SocialActions } from "./SocialActions";
import { StationManagementSheet } from "./StationManagementSheet";
import { StationDetailSheet } from "./StationDetailSheet";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { cn, getDeterministicColor } from "@/lib/utils";
import { UserAvatar } from "./UserAvatar";

interface RadioCardProps {
  station: NDKStation;
  className?: string;
}

export const RadioCard: React.FC<RadioCardProps & { className?: string }> = ({
  station,
  className,
}) => {
  const { currentStation, currentStream, isPlaying, playStation, pause } =
    usePlayerStore();
  const { addFavorite, removeFavorite, isLoggedIn } = useFavorites();
  const { toggleGenre } = useFilterStore();
  const currentUser = useNDKCurrentUser();
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [showDetailSheet, setShowDetailSheet] = useState(false);
  const [focusCommentForm, setFocusCommentForm] = useState(false);
  const [selectedStream, setSelectedStream] = useState<Stream | undefined>(
    station.streams.find((s) => s.primary) || station.streams[0]
  );

  const handleGenreClick = (genre: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering card click
    toggleGenre(genre);
  };

  const handleCommentClick = () => {
    setShowDetailSheet(true);
    setFocusCommentForm(true);
  };

  const isCurrentStation = currentStation?.id === station.id;
  const isCurrentlyPlaying = isCurrentStation && isPlaying;
  const isOwner = currentUser?.pubkey === station.pubkey;

  // Generate unique, deterministic color based on station ID (d tag)
  const backgroundColor = station.stationId
    ? getDeterministicColor(station.stationId, 85)
    : "hsl(0, 0%, 85%)"; // Fallback to gray if no stationId

  // Darker version for border underscore
  const underscoreColor = station.stationId
    ? getDeterministicColor(station.stationId, 50)
    : "hsl(0, 0%, 50%)";

  const handlePlayClick = () => {
    if (isCurrentlyPlaying) {
      pause();
    } else {
      playStation(station, selectedStream);
    }
  };

  const handleStreamSelect = (stream: Stream) => {
    setSelectedStream(stream);
    // If this station is currently playing, switch to the new stream
    if (isCurrentStation) {
      playStation(station, stream);
    }
  };

  const handleAddToList = async (listId: string) => {
    if (station.pubkey && station.stationId) {
      await addFavorite(station, listId);
    }
  };

  const handleRemoveFromList = async (_listId: string) => {
    if (station.pubkey && station.stationId) {
      // removeFavorite removes from all lists for now
      await removeFavorite(station);
    }
  };

  const handleDeleteStation = async () => {
    if (
      !confirm(
        `Are you sure you want to delete "${station.name}"? This action cannot be undone.`
      )
    ) {
      return;
    }

    try {
      await station.deleteStation();
      setShowActionMenu(false);
      console.log("Station deleted successfully");
    } catch (error) {
      console.error("Failed to delete station:", error);
      alert("Failed to delete the station. Please try again.");
    }
  };

  return (
    <Card className={`relative group ${cn(className)}`}>
      {/* Desktop Layout - Card with image on top */}
      <div className="hidden md:flex md:flex-col h-[300px]">
        {/* Top Actions */}
        <div className="absolute top-2 right-2 z-10 flex gap-2">
          {/* Favorites Dropdown */}
          {isLoggedIn && station.pubkey && station.stationId && (
            <FavoritesDropdown
              station={station}
              onAddToList={handleAddToList}
              onRemoveFromList={handleRemoveFromList}
            />
          )}

          {/* Owner Actions Menu */}
          {isOwner && (
            <div className="relative">
              <Button
                onClick={() => setShowActionMenu(!showActionMenu)}
                title="Station actions"
              >
                <MoreVertical className="w-4 h-4 text-gray-500" />
              </Button>

              {showActionMenu && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-xl z-50">
                  <div className="py-1">
                    <StationManagementSheet
                      station={station}
                      mode="edit"
                      trigger={
                        <Button
                          variant="ghost"
                          className="w-full justify-start px-4 py-2 text-sm"
                        >
                          <Edit3 className="w-4 h-4 mr-2" />
                          Edit Station
                        </Button>
                      }
                    />
                    <Button
                      variant="ghost"
                      className="w-full justify-start px-4 py-2 text-sm text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={handleDeleteStation}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Station
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Backdrop to close action menu */}
        {showActionMenu && (
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowActionMenu(false)}
          />
        )}

        {/* Station Thumbnail with Play Overlay */}
        {station.thumbnail ? (
          <div className="aspect-[9/16] w-full overflow-hidden relative">
            <img
              src={station.thumbnail}
              alt={station.name || "Radio Station"}
              className="w-full h-full object-cover"
            />
            {/* Play Button Overlay */}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Button
                onClick={handlePlayClick}
                className={`rounded-full transition-all transform hover:scale-110 ${
                  isCurrentlyPlaying
                    ? "bg-blue-600 hover:bg-blue-700"
                    : "bg-white/90 hover:bg-white"
                }`}
                title={isCurrentlyPlaying ? "Pause" : "Play"}
              >
                {isCurrentlyPlaying ? (
                  <Pause className="w-8 h-8 text-black" />
                ) : (
                  <Play className="w-8 h-8 text-gray-900" />
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div
            className="aspect-[9/16] w-full overflow-hidden relative flex items-center justify-center cursor-pointer"
            style={{ backgroundColor }}
            onClick={handlePlayClick}
          >
            {/* Radio Icon Background */}
            <Radio className="w-48 h-48 text-muted-foreground/20 absolute" />

            {/* Play Button Overlay - hidden by default, shown on hover or when playing */}
            <div
              className={`absolute inset-0 transition-all flex items-center justify-center ${
                isCurrentlyPlaying
                  ? "bg-black/40"
                  : "bg-black/0 group-hover:bg-black/40"
              }`}
            >
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  handlePlayClick();
                }}
                className={`rounded-full transition-all transform hover:scale-110 ${
                  isCurrentlyPlaying
                    ? "bg-primary hover:bg-primary/90"
                    : "bg-background/90 hover:bg-background shadow-brutal opacity-0 group-hover:opacity-100"
                }`}
                title={isCurrentlyPlaying ? "Pause" : "Play"}
              >
                {isCurrentlyPlaying ? (
                  <Pause className="w-8 h-8 text-black" />
                ) : (
                  <Play className="w-8 h-8 text-gray-900" />
                )}
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-col min-w-0 p-2 flex-1">
          {/* Station Name with External Link */}
          <div
            className="flex items-center gap-1 mb-1 min-w-0 pb-1 border-b-4"
            style={{ borderColor: underscoreColor }}
          >
            <h3
              className="font-semibold text-sm text-gray-900 line-clamp-1 cursor-pointer hover:text-blue-600 transition-colors flex-1 min-w-0"
              onClick={() => setShowDetailSheet(true)}
            >
              {station.name || "Unnamed Station"}
            </h3>
            <Link
              to="/station/$naddr"
              params={{ naddr: station.naddr }}
              className="flex-shrink-0"
              title="Open full page"
            >
              <Button
                variant="ghost"
                size="icon-sm"
                className="h-5 w-5 p-0 hover:bg-gray-100"
              >
                <ExternalLink className="h-3 w-3 text-gray-500 hover:text-blue-600" />
              </Button>
            </Link>
          </div>
          <UserAvatar pubkey={station.pubkey} mode="avatar-name" />
          {/* Station Description */}
          <p className="text-gray-600 text-xs mb-2 line-clamp-2">
            {station.description || "No description available"}
          </p>
          {/* Station Genres - flexible spacer */}
          <div className="flex gap-1 overflow-hidden min-w-0 mb-2 min-h-[20px]">
            {station.genres && station.genres.length > 0 ? (
              <>
                {station.genres.slice(0, 2).map((genre, index) => (
                  <Badge
                    key={index}
                    className="cursor-pointer hover:bg-primary/80 transition-colors"
                    onClick={(e) => handleGenreClick(genre, e)}
                    title={`Filter by ${genre}`}
                  >
                    {genre}
                  </Badge>
                ))}
                {station.genres.length > 2 && (
                  <Badge
                    className="cursor-default"
                    title={station.genres.slice(2).join(", ")}
                  >
                    +{station.genres.length - 2}
                  </Badge>
                )}
              </>
            ) : null}
          </div>
          {/* Language and Social Actions - always at bottom */}
          <div className="flex flex-row justify-between items-center mt-auto">
            <div className="text-xs text-gray-500 flex-shrink-0">
              {station.languages?.[0] &&
              station.languages[0] &&
              station.languages[0].length > 6
                ? station.languages[0].substring(0, 6)
                : station.languages[0]}
            </div>

            <SocialActions
              station={station}
              onCommentClick={handleCommentClick}
            />
          </div>
        </div>
      </div>

      {/* Mobile Layout - List with image on the side */}
      <div className="flex md:hidden gap-0">
        {/* Left: Thumbnail with Play Button - Square, no padding */}
        <div className="flex-shrink-0 relative w-24 h-24 overflow-hidden">
          {station.thumbnail ? (
            <div className="w-full h-full relative">
              <img
                src={station.thumbnail}
                alt={station.name || "Radio Station"}
                className="w-full h-full object-cover block"
              />
              {/* Play Button Overlay */}
              <div
                className={`absolute inset-0 flex items-center justify-center transition-opacity ${
                  isCurrentlyPlaying ? "bg-black/40" : "bg-black/20"
                }`}
              >
                <Button
                  onClick={handlePlayClick}
                  className={`rounded-full p-2 ${
                    isCurrentlyPlaying
                      ? "bg-blue-600 hover:bg-blue-700"
                      : "bg-white/90 hover:bg-white"
                  }`}
                  title={isCurrentlyPlaying ? "Pause" : "Play"}
                >
                  {isCurrentlyPlaying ? (
                    <Pause className="w-4 h-4 text-white" />
                  ) : (
                    <Play className="w-4 h-4 text-gray-900" />
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div
              className="w-full h-full flex items-center justify-center relative cursor-pointer"
              style={{ backgroundColor }}
              onClick={handlePlayClick}
            >
              <Radio className="w-8 h-8 text-muted-foreground/30 absolute" />
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  handlePlayClick();
                }}
                className={`rounded-full p-2 z-10 ${
                  isCurrentlyPlaying
                    ? "bg-primary hover:bg-primary/90"
                    : "bg-background/90 hover:bg-background"
                }`}
                title={isCurrentlyPlaying ? "Pause" : "Play"}
              >
                {isCurrentlyPlaying ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
              </Button>
            </div>
          )}
        </div>

        {/* Center: Station Info */}
        <div className="flex flex-col justify-between min-w-0 p-1 w-full">
          {/* Station Name with External Link */}
          <div
            className="flex items-center gap-1 mb-1 min-w-0 pb-1 border-b-4"
            style={{ borderColor: underscoreColor }}
          >
            <h3
              className="font-semibold text-sm text-gray-900 line-clamp-1 cursor-pointer hover:text-blue-600 transition-colors flex-1 min-w-0"
              onClick={() => setShowDetailSheet(true)}
            >
              {station.name || "Unnamed Station"}{" "}
              {station.description ? ` - ${station.description}` : ""}
            </h3>
            <Link
              to="/station/$naddr"
              params={{ naddr: station.naddr }}
              className="flex-shrink-0"
              title="Open full page"
            >
              <Button
                variant="ghost"
                size="icon-sm"
                className="h-5 w-5 p-0 hover:bg-gray-100"
              >
                <ExternalLink className="h-3 w-3 text-gray-500 hover:text-blue-600" />
              </Button>
            </Link>
          </div>

          {/* Station Genres */}
          {station.genres && station.genres.length > 0 && (
            <div className="flex gap-1 overflow-hidden min-w-0">
              {station.genres.slice(0, 2).map((genre, index) => (
                <Badge
                  key={index}
                  className="cursor-pointer hover:bg-primary/80 transition-colors"
                  onClick={(e) => handleGenreClick(genre, e)}
                  title={`Filter by ${genre}`}
                >
                  {genre}
                </Badge>
              ))}
              {station.genres.length > 2 && (
                <Badge
                  className="cursor-default"
                  title={station.genres.slice(2).join(", ")}
                >
                  +{station.genres.length - 2}
                </Badge>
              )}
            </div>
          )}

          <div className="flex flex-row justify-between items-center">
            <div className="text-xs text-gray-500 flex-shrink-0">
              {station.languages?.[0] &&
              station.languages[0] &&
              station.languages[0].length > 6
                ? station.languages[0].substring(0, 6)
                : station.languages[0]}
            </div>

            <SocialActions
              station={station}
              onCommentClick={handleCommentClick}
            />
          </div>
        </div>

        {/* Right: Action Buttons */}
        <div className="flex-shrink-0 flex flex-col gap-1 pr-2 pt-2">
          {/* Favorites Dropdown */}
          {isLoggedIn && station.pubkey && station.stationId && (
            <FavoritesDropdown
              station={station}
              onAddToList={handleAddToList}
              onRemoveFromList={handleRemoveFromList}
            />
          )}

          {/* Owner Actions Menu */}
          {isOwner && (
            <div className="relative">
              <Button
                onClick={() => setShowActionMenu(!showActionMenu)}
                title="Station actions"
                size="icon-sm"
              >
                <MoreVertical className="w-4 h-4 text-gray-500" />
              </Button>

              {showActionMenu && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-xl z-50">
                  <div className="py-1">
                    <StationManagementSheet
                      station={station}
                      mode="edit"
                      trigger={
                        <Button
                          variant="ghost"
                          className="w-full justify-start px-4 py-2 text-sm"
                        >
                          <Edit3 className="w-4 h-4 mr-2" />
                          Edit Station
                        </Button>
                      }
                    />
                    <Button
                      variant="ghost"
                      className="w-full justify-start px-4 py-2 text-sm text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={handleDeleteStation}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Station
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Backdrop to close action menu */}
        {showActionMenu && (
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowActionMenu(false)}
          />
        )}
      </div>

      {/* Station Detail Sheet */}
      <StationDetailSheet
        station={station}
        open={showDetailSheet}
        onOpenChange={(open) => {
          setShowDetailSheet(open);
          if (!open) setFocusCommentForm(false);
        }}
        focusCommentForm={focusCommentForm}
        onCommentFormFocused={() => setFocusCommentForm(false)}
      />
    </Card>
  );
};
