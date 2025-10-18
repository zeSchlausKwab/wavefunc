import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { MessageCircleIcon } from "./ui/icons/lucide-message-circle";
import type { NDKStation } from "../lib/NDKStation";

interface CommentsDialogProps {
  station: NDKStation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commentCount: number;
  onComment?: (content: string) => Promise<void>;
}

export const CommentsDialog: React.FC<CommentsDialogProps> = ({
  station,
  open,
  onOpenChange,
  commentCount,
  onComment,
}) => {
  const [commentText, setCommentText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!commentText.trim()) return;

    setIsSubmitting(true);
    try {
      if (onComment) {
        await onComment(commentText);
      }
      // Mock implementation - in real app, this would create a NIP-22 reply
      console.log(`Commenting on station ${station.name}:`, commentText);

      // Clear input after successful comment
      setCommentText("");
    } catch (error) {
      console.error("Error commenting:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircleIcon className="w-5 h-5 text-green-500" />
            Comments on {station.name}
          </DialogTitle>
          <DialogDescription>
            {commentCount === 0
              ? "Be the first to comment on this station"
              : `${commentCount} comment${commentCount === 1 ? "" : "s"}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Comments List Placeholder */}
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {commentCount === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <MessageCircleIcon className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No comments yet</p>
              </div>
            ) : (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                <p className="font-semibold">Comments list not implemented</p>
                <p className="text-xs mt-1">
                  Showing count only. Full comment thread UI coming soon.
                </p>
              </div>
            )}
          </div>

          {/* Comment Input */}
          <div className="space-y-2">
            <label htmlFor="comment" className="text-sm font-medium">
              Add a comment
            </label>
            <textarea
              id="comment"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Share your thoughts about this station..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>

          {/* Mock Notice */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
            <p className="font-semibold">Mock Implementation</p>
            <p className="text-xs mt-1">
              This is a placeholder. NIP-22 commenting is not yet fully implemented.
            </p>
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!commentText.trim() || isSubmitting}
            className="bg-green-500 hover:bg-green-600 text-white"
          >
            <MessageCircleIcon className="w-4 h-4 mr-2" />
            {isSubmitting ? "Posting..." : "Post Comment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};