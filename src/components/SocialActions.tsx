import { useNDKCurrentUser } from "@nostr-dev-kit/react";
import React, { useState } from "react";
import { useSocialInteractions } from "../lib/hooks/useSocialInteractions";
import type { NDKStation } from "../lib/NDKStation";
import { AuthRequiredButton } from "./AuthRequiredButton";
import { DebugDialog } from "./DebugDialog";
import { Button } from "./ui/button";
import { HeartIcon } from "./ui/icons/lucide-heart";
import { MessageCircleIcon } from "./ui/icons/lucide-message-circle";
import { ZapIcon } from "./ui/icons/lucide-zap";
import { FileJsonIcon } from "./ui/icons/lucide-file-json";
import { ZapDialog } from "./ZapDialog";

interface SocialActionsProps {
  station: NDKStation;
  className?: string;
  showDebug?: boolean;
  onCommentClick?: () => void; // Callback to open detail sheet and focus comment form
}

/**
 * SocialActions component displays reaction, zap, and comment buttons
 * with counts and user interaction state.
 *
 * Features:
 * - Heart: Reactions (kind 7) - filled red when user has reacted
 * - Lightning: Zaps (kind 9735) - filled yellow when user has zapped
 * - Comment: NIP-22 replies (kind 1111) - filled green when user has commented
 */
export const SocialActions: React.FC<SocialActionsProps> = ({
  station,
  className = "",
  showDebug = true,
  onCommentClick,
}) => {
  const currentUser = useNDKCurrentUser();
  const {
    reactions,
    zaps,
    comments,
    userHasReacted,
    userHasZapped,
    userHasCommented,
    isLoading,
  } = useSocialInteractions(station);

  const [showZapDialog, setShowZapDialog] = useState(false);
  const [showDebugDialog, setShowDebugDialog] = useState(false);

  const handleReaction = async () => {
    if (!currentUser) {
      alert("Please log in to react to stations");
      return;
    }
    await station.react("❤️", true);
  };

  const handleZap = async (amount: number) => {
    if (!currentUser) {
      alert("Please log in to zap stations");
      return;
    }

    try {
      // Mock implementation - in real app, this would use station.zap()
      console.log(`Zapping ${amount} sats to station:`, station.name);
      // await station.zap(...)
    } catch (error) {
      console.error("Error zapping:", error);
    }
  };

  const formatCount = (count: number): string => {
    if (count === 0) return "";
    if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
    return count.toString();
  };

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {/* Heart/Reaction Button */}
      <AuthRequiredButton
        variant="ghost"
        size="sm"
        onClick={handleReaction}
        className={`gap-1.5 ${
          userHasReacted
            ? "text-red-500 hover:text-red-600"
            : "text-gray-600 hover:text-red-500"
        }`}
        title={userHasReacted ? "You reacted to this" : "React with a heart"}
        loginTooltipMessage="Please log in to use reactions"
      >
        <HeartIcon
          className={`w-4 h-4 ${userHasReacted ? "fill-current" : ""}`}
        />
        {reactions > 0 && (
          <span className="text-xs font-medium">{formatCount(reactions)}</span>
        )}
      </AuthRequiredButton>

      {/* Lightning/Zap Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowZapDialog(true)}
        disabled={isLoading || !currentUser}
        className={`gap-1.5 ${
          userHasZapped
            ? "text-yellow-500 hover:text-yellow-600"
            : "text-gray-600 hover:text-yellow-500"
        }`}
        title={userHasZapped ? "You zapped this" : "Zap with lightning"}
      >
        <ZapIcon className={`w-4 h-4 ${userHasZapped ? "fill-current" : ""}`} />
        {zaps > 0 && (
          <span className="text-xs font-medium">{formatCount(zaps)}</span>
        )}
      </Button>

      {/* Comment Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onCommentClick}
        disabled={isLoading}
        className={`gap-1.5 ${
          userHasCommented
            ? "text-green-500 hover:text-green-600"
            : "text-gray-600 hover:text-green-500"
        }`}
        title={userHasCommented ? "You commented on this" : "Add a comment"}
      >
        <MessageCircleIcon
          className={`w-4 h-4 ${userHasCommented ? "fill-current" : ""}`}
        />
        {comments > 0 && (
          <span className="text-xs font-medium">{formatCount(comments)}</span>
        )}
      </Button>

      {/* Debug/JSON Button */}
      {showDebug && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowDebugDialog(true)}
          className="gap-1.5 text-gray-600 hover:text-gray-900"
          title="View raw event data"
        >
          <FileJsonIcon className="w-4 h-4" />
        </Button>
      )}

      {/* Zap Dialog */}
      <ZapDialog
        station={station}
        open={showZapDialog}
        onOpenChange={setShowZapDialog}
        onZap={handleZap}
      />

      {/* Debug Dialog */}
      {showDebug && (
        <DebugDialog
          station={station}
          open={showDebugDialog}
          onOpenChange={setShowDebugDialog}
        />
      )}
    </div>
  );
};
