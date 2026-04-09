import type { NostrEvent } from "applesauce-core/helpers/event";
import { formatDistanceToNow } from "date-fns";
import React, { useState } from "react";
import { buildCommentReplyTemplate } from "../lib/nostr/domain";
import { useCurrentAccount } from "../lib/nostr/auth";
import { useWavefuncNostr } from "../lib/nostr/runtime";
import type { CommentNode } from "../lib/hooks/useComments";
import { CommentForm } from "./CommentForm";
import { CommentContent } from "./CommentContent";
import { SocialActions } from "./SocialActions";
import { Button } from "./ui/button";
import { UserAvatar } from "./UserAvatar";
import EmbeddableComment from "./EmbeddableComment";

interface CommentProps {
  commentNode: CommentNode;
  stationAddress: string;
  stationId: string;
  maxDepth?: number;
}

export const Comment: React.FC<CommentProps> = ({
  commentNode,
  stationAddress,
  stationId,
  maxDepth = 5,
}) => {
  const { event, children, depth } = commentNode;
  const currentUser = useCurrentAccount();
  const { signAndPublish } = useWavefuncNostr();
  const [isExpanded, setIsExpanded] = useState(true);
  const [showReplyForm, setShowReplyForm] = useState(false);

  const timestamp = event.created_at
    ? formatDistanceToNow(new Date(event.created_at * 1000), {
        addSuffix: true,
      })
    : "Unknown time";

  const indentLevel = Math.min(depth, maxDepth);
  const indentStyle = {
    marginLeft: `${indentLevel * 1.5}rem`,
  };

  const hasChildren = children.length > 0;

  const handleReply = async (content: string) => {
    if (!currentUser) {
      alert("Please log in to reply to comments");
      return;
    }

    try {
      await signAndPublish(
        buildCommentReplyTemplate(event, stationAddress, stationId, content),
      );
      setShowReplyForm(false);
    } catch (error) {
      console.error("Error posting reply:", error);
      throw error;
    }
  };

  return (
    <div className="space-y-2">
      <div
        className="border-l-2 border-gray-200 pl-3 hover:border-gray-300 transition-colors"
        style={depth > 0 ? indentStyle : undefined}
      >
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-1 min-w-0">
              <UserAvatar pubkey={event.pubkey} mode="avatar-name" size="sm" />
              <span className="text-xs text-gray-500 ml-8">{timestamp}</span>
            </div>

            {hasChildren && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
                className="text-xs text-gray-500 hover:text-gray-700 flex-shrink-0"
              >
                {isExpanded ? "−" : `+ ${children.length}`}
              </Button>
            )}
          </div>

          <EmbeddableComment
            content={event.content}
            allowVideoEmbeds
          />

          <div className="flex items-center gap-2">
            <SocialActions
              station={event}
              className="flex-shrink-0"
              showDebug={false}
              onCommentClick={() => setShowReplyForm(!showReplyForm)}
            />
          </div>
        </div>

        {showReplyForm && (
          <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <CommentForm
              onSubmit={handleReply}
              onCancel={() => setShowReplyForm(false)}
              placeholder="Write your reply..."
              autoFocus
            />
          </div>
        )}
      </div>

      {isExpanded && children.length > 0 && (
        <div className="space-y-2">
          {children.map((childNode) => (
            <Comment
              key={childNode.event.id}
              commentNode={childNode}
              stationAddress={stationAddress}
              stationId={stationId}
              maxDepth={maxDepth}
            />
          ))}
        </div>
      )}
    </div>
  );
};
