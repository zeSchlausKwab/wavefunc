import { Pause, Play, MoreVertical, Edit3, Trash2 } from "lucide-react";
import React, { useState } from "react";
import { useFavorites } from "../lib/hooks/useFavorites";
import { NDKStation, type Stream } from "../lib/NDKStation";
import { usePlayerStore } from "../stores/playerStore";
import { FavoritesDropdown } from "./FavoritesDropdown";
import { StationManagementSheet } from "./StationManagementSheet";
import { useNDKCurrentUser } from "@nostr-dev-kit/react";
import { DebugDialog } from "./DebugDialog";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { StreamSelector } from "./StreamSelector";
import { FileJsonIcon } from "./ui/icons/lucide-file-json";
import { SocialActions } from "./SocialActions";

interface RadioCardProps {
  station: NDKStation;
}

export const RadioCard: React.FC<RadioCardProps> = ({ station }) => {
  const { currentStation, currentStream, isPlaying, playStation, pause } = usePlayerStore();
  const { addFavorite, removeFavorite, isLoggedIn } = useFavorites();
  const currentUser = useNDKCurrentUser();
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [showDebugDialog, setShowDebugDialog] = useState(false);
  const [selectedStream, setSelectedStream] = useState<Stream | undefined>(
    station.streams.find(s => s.primary) || station.streams[0]
  );

  const isCurrentStation = currentStation?.id === station.id;
  const isCurrentlyPlaying = isCurrentStation && isPlaying;
  const isOwner = currentUser?.pubkey === station.pubkey;

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

  return (
    <Card className="relative group">
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
                      <Button>
                        <Edit3 className="w-4 h-4" />
                        Edit Station
                      </Button>
                    }
                  />
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
      {station.thumbnail && (
        <div className="aspect-video w-full overflow-hidden relative">
          <img
            src={station.thumbnail}
            alt={station.name || "Radio Station"}
            className="w-full h-full object-cover"
          />
          {/* Play Button Overlay */}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Button
              onClick={handlePlayClick}
              className={`p-4 rounded-full transition-all transform hover:scale-110 ${
                isCurrentlyPlaying
                  ? "bg-blue-600 hover:bg-blue-700"
                  : "bg-white/90 hover:bg-white"
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
      )}

      {/* Play Button for cards without thumbnail */}
      {!station.thumbnail && (
        <div className="aspect-video w-full overflow-hidden relative bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
          <Button
            onClick={handlePlayClick}
            className={`p-4 rounded-full transition-all transform hover:scale-110 ${
              isCurrentlyPlaying
                ? "bg-white/90 hover:bg-white"
                : "bg-black/40 hover:bg-black/60"
            }`}
            title={isCurrentlyPlaying ? "Pause" : "Play"}
          >
            {isCurrentlyPlaying ? (
              <Pause className="w-8 h-8 text-gray-900" />
            ) : (
              <Play className="w-8 h-8 text-white" />
            )}
          </Button>
        </div>
      )}

      {/* Station Content */}
      <div className="p-4">
        {/* Station Name */}
        <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2">
          {station.name || "Unnamed Station"}
        </h3>

        {/* Station Description */}
        {station.description && (
          <p className="text-gray-600 text-sm mb-3 line-clamp-3">
            {station.description}
          </p>
        )}

        {/* Station Genres */}
        {station.genres && station.genres.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {station.genres.slice(0, 3).map((genre, index) => (
              <span
                key={index}
                className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full"
              >
                {genre}
              </span>
            ))}
            {station.genres.length > 3 && (
              <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                +{station.genres.length - 3} more
              </span>
            )}
          </div>
        )}

        {/* Stream Quality Selector */}
        {station.streams && station.streams.length > 1 && (
          <div className="mb-3">
            <StreamSelector
              streams={station.streams}
              selectedStreamUrl={isCurrentStation ? currentStream?.url : selectedStream?.url}
              onStreamSelect={handleStreamSelect}
              className="w-full justify-start px-2 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200"
            />
          </div>
        )}

        {/* Social Actions */}
        <div className="mb-3 pb-3 border-b border-gray-100">
          <SocialActions station={station} />
        </div>

        {/* Station Metadata */}
        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center space-x-2">
            {station.location && <span>{station.location}</span>}
            {station.languages && station.languages.length > 0 && (
              <span className="capitalize">{station.languages[0]}</span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => setShowDebugDialog(true)}
              title="View raw event data"
            >
              <FileJsonIcon className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Debug Dialog */}
      <DebugDialog
        station={station}
        open={showDebugDialog}
        onOpenChange={setShowDebugDialog}
      />
    </Card>
  );
};
