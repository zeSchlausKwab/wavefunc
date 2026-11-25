import React, { useState, forwardRef } from "react";
import { useCurrentAccount } from "../lib/nostr/auth";
import { Button } from "./ui/button";
import { MessageCircleIcon } from "./ui/icons/lucide-message-circle";

interface CommentFormProps {
  onSubmit: (content: string) => Promise<void>;
  onCancel?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export const CommentForm = forwardRef<HTMLTextAreaElement, CommentFormProps>(({
  onSubmit,
  onCancel,
  placeholder = "Share your thoughts...",
  autoFocus = false,
}, ref) => {
  const currentUser = useCurrentAccount();
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!content.trim()) return;

    setIsSubmitting(true);
    try {
      await onSubmit(content);
      setContent("");
      if (onCancel) onCancel();
    } catch (error) {
      console.error("Error submitting comment:", error);
      alert("Failed to post comment. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isReply = !!onCancel;

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="relative">
        <textarea
          ref={ref}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={placeholder}
          aria-label={isReply ? "Reply" : "Comment"}
          rows={3}
          autoFocus={autoFocus}
          disabled={isSubmitting || !currentUser}
          className="block w-full resize-y border-2 border-on-background bg-surface px-3 pt-2 pb-6 text-sm focus-visible:outline-primary disabled:bg-surface-container-low disabled:cursor-not-allowed"
        />
        <div className="absolute bottom-2 right-2 text-xs text-on-background/60">
          {content.length}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        {!currentUser && (
          <p className="text-xs text-on-background/70 flex-1">
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
            className="border-2 border-on-background bg-primary font-bold text-white hover:bg-on-background"
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
