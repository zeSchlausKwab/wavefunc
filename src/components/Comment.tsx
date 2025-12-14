import { NDKEvent, useNDK, useNDKCurrentUser } from "@nostr-dev-kit/react";
import { formatDistanceToNow } from "date-fns";
import React, { useState } from "react";
import type { CommentNode } from "../lib/hooks/useComments";
import { CommentForm } from "./CommentForm";
import { CommentContent } from "./CommentContent";
import { SocialActions } from "./SocialActions";
import { Button } from "./ui/button";
import { UserAvatar } from "./UserAvatar";
import EmbeddableComment from "./EmbeddableComment";

interface CommentProps {
  commentNode: CommentNode;
  stationAddress: string; // Station address for tagging replies
  stationId: string; // Station event ID for root tag
  maxDepth?: number;
}

/**
 * Comment component displays a single comment with:
 * - Author avatar and name
 * - Comment content
 * - Timestamp
 * - SocialActions (like, zap, reply)
 * - Nested replies with indentation
 *
 * Each reply is slightly indented from its parent (up to maxDepth)
 */
export const Comment: React.FC<CommentProps> = ({
  commentNode,
  stationAddress,
  stationId,
  maxDepth = 5,
}) => {
  const { event, children, depth } = commentNode;
  const { ndk } = useNDK();
  const currentUser = useNDKCurrentUser();
  const [isExpanded, setIsExpanded] = useState(true);
  const [showReplyForm, setShowReplyForm] = useState(false);

  const timestamp = event.created_at
    ? formatDistanceToNow(new Date(event.created_at * 1000), {
        addSuffix: true,
      })
    : "Unknown time";

  // Calculate indentation based on depth (max 5 levels)
  const indentLevel = Math.min(depth, maxDepth);
  const indentClass = `ml-${indentLevel * 4}`; // Tailwind: ml-4, ml-8, ml-12, ml-16, ml-20

  // Use inline style for dynamic indentation since Tailwind doesn't support dynamic classes
  const indentStyle = {
    marginLeft: `${indentLevel * 1.5}rem`,
  };

  const hasChildren = children.length > 0;

  const handleReply = async (content: string) => {
    if (!currentUser || !ndk) {
      alert("Please log in to reply to comments");
      return;
    }

    try {
      const reply = new NDKEvent(ndk, {
        kind: 1111, // NIP-22 Generic Reply
        content,
      });

      reply.tags.push(["e", event.id, "", "reply"]);
      reply.tags.push(["p", event.pubkey]);
      reply.tags.push(["A", stationAddress]);
      reply.tags.push(["e", stationId, "", "root"]);

      await reply.publish();
      console.log("Posted reply to comment:", event.id);
      setShowReplyForm(false);
    } catch (error) {
      console.error("Error posting reply:", error);
      throw error;
    }
  };

  return (
    <div className="space-y-2">
      {/* Main Comment */}
      <div
        className="border-l-2 border-gray-200 pl-3 hover:border-gray-300 transition-colors"
        style={depth > 0 ? indentStyle : undefined}
      >
        <div className="space-y-2">
          {/* Author and Timestamp */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-1 min-w-0">
              <UserAvatar pubkey={event.pubkey} mode="avatar-name" size="sm" />
              <span className="text-xs text-gray-500 ml-8">{timestamp}</span>
            </div>

            {/* Collapse/Expand button for comments with replies */}
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

          {/* Comment Content */}
          <EmbeddableComment
            content={event.content}
            allowVideoEmbeds
          />

          {/* Actions Row */}
          <div className="flex items-center gap-2">
            {/* Social Actions: Heart, Zap, Comment (Reply) */}
            <SocialActions
              station={event as any}
              className="flex-shrink-0"
              showDebug={false}
              onCommentClick={() => setShowReplyForm(!showReplyForm)}
            />
          </div>
        </div>

        {/* Inline Reply Form */}
        {showReplyForm && (
          <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <CommentForm
              onSubmit={handleReply}
              onCancel={() => setShowReplyForm(false)}
              placeholder="Write your reply..."
              parentEvent={event}
              autoFocus
            />
          </div>
        )}
      </div>

      {/* Nested Replies */}
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
