import type { NostrEvent } from "applesauce-core/helpers/event";
import React, { useState } from "react";
import { buildStationReactionTemplate } from "../lib/nostr/domain";
import { useCurrentAccount } from "../lib/nostr/auth";
import { useWavefuncNostr } from "../lib/nostr/runtime";
import { useSocialInteractions } from "../lib/hooks/useSocialInteractions";
import { AuthRequiredButton } from "./AuthRequiredButton";
import { DebugDialog } from "./DebugDialog";
import { Button } from "./ui/button";
import { HeartIcon } from "./ui/icons/lucide-heart";
import { MessageCircleIcon } from "./ui/icons/lucide-message-circle";
import { ZapIcon } from "./ui/icons/lucide-zap";
import { FileJsonIcon } from "./ui/icons/lucide-file-json";
import { ZapDialog } from "./ZapDialog";

type SocialTarget = Pick<NostrEvent, "id" | "kind" | "pubkey" | "tags">;

interface SocialActionsProps {
  station: SocialTarget;
  className?: string;
  showDebug?: boolean;
  onCommentClick?: () => void;
}

export const SocialActions: React.FC<SocialActionsProps> = ({
  station,
  className = "",
  showDebug = true,
  onCommentClick,
}) => {
  const currentUser = useCurrentAccount();
  const { signAndPublish } = useWavefuncNostr();
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
    await signAndPublish(buildStationReactionTemplate(station));
  };

  const handleZap = async (amount: number) => {
    if (!currentUser) {
      alert("Please log in to zap stations");
      return;
    }
    console.log(`Zapping ${amount} sats to station:`, station.id);
  };

  const formatCount = (count: number): string => {
    if (count === 0) return "";
    if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
    return count.toString();
  };

  return (
    <div className={`flex items-center gap-1 ${className}`}>
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

      <ZapDialog
        station={station}
        open={showZapDialog}
        onOpenChange={setShowZapDialog}
        onZap={handleZap}
      />

      {showDebug && (
        <DebugDialog
          event={station}
          open={showDebugDialog}
          onOpenChange={setShowDebugDialog}
        />
      )}
    </div>
  );
};
