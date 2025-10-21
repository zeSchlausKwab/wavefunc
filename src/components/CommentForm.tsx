import { NDKEvent, useNDKCurrentUser } from "@nostr-dev-kit/react";
import React, { useState, forwardRef } from "react";
import { Button } from "./ui/button";
import { MessageCircleIcon } from "./ui/icons/lucide-message-circle";

interface CommentFormProps {
  onSubmit: (content: string) => Promise<void>;
  onCancel?: () => void;
  placeholder?: string;
  parentEvent?: NDKEvent | null;
  autoFocus?: boolean;
}

/**
 * CommentForm component for posting new comments or replies
 *
 * Features:
 * - Textarea input with character count
 * - Shows parent context when replying
 * - Submit and cancel buttons
 * - Loading state during submission
 */
export const CommentForm = forwardRef<HTMLTextAreaElement, CommentFormProps>(({
  onSubmit,
  onCancel,
  placeholder = "Share your thoughts...",
  parentEvent = null,
  autoFocus = false,
}, ref) => {
  const currentUser = useNDKCurrentUser();
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!content.trim()) return;

    setIsSubmitting(true);
    try {
      await onSubmit(content);
      setContent(""); // Clear form on success
      if (onCancel) onCancel(); // Close reply form if it's a reply
    } catch (error) {
      console.error("Error submitting comment:", error);
      alert("Failed to post comment. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isReply = !!parentEvent;

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Textarea */}
      <div className="relative">
        <textarea
          ref={ref}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={placeholder}
          rows={isReply ? 3 : 4}
          autoFocus={autoFocus}
          disabled={isSubmitting || !currentUser}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
        />

        {/* Character count */}
        <div className="absolute bottom-2 right-2 text-xs text-gray-400">
          {content.length}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between gap-2">
        {!currentUser && (
          <p className="text-xs text-gray-500 flex-1">
            Please log in to comment
          </p>
        )}

        <div className="flex items-center gap-2 ml-auto">
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          )}

          <Button
            type="submit"
            size="sm"
            disabled={!content.trim() || isSubmitting || !currentUser}
            className="bg-green-500 hover:bg-green-600 text-white"
          >
            <MessageCircleIcon className="w-4 h-4 mr-2" />
            {isSubmitting ? "Posting..." : isReply ? "Reply" : "Comment"}
          </Button>
        </div>
      </div>
    </form>
  );
});

CommentForm.displayName = "CommentForm";