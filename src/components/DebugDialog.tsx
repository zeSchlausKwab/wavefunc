import type { NostrEvent } from "applesauce-core/helpers/event";
import React from "react";
import JsonView from 'react18-json-view'
import 'react18-json-view/src/style.css'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";

interface DebugDialogProps {
  event: Pick<NostrEvent, "id" | "kind" | "pubkey" | "tags" | "content" | "created_at">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const DebugDialog: React.FC<DebugDialogProps> = ({
  event,
  open,
  onOpenChange,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Radio Event Debug</DialogTitle>
          <DialogDescription>
            Raw Nostr event data for event {event.id?.slice(0, 12)}...
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-auto bg-gray-50 rounded-md p-4">
          <JsonView
            src={event}
            collapsed={1}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};
