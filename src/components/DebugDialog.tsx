import type { NostrEvent } from "applesauce-core/helpers/event";
import React, { Suspense, lazy } from "react";
import "react18-json-view/src/style.css";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";

const LazyJsonView = lazy(() => import("react18-json-view"));

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
          {open && (
            <Suspense fallback={<pre className="text-xs font-mono">{JSON.stringify(event, null, 2)}</pre>}>
              <LazyJsonView src={event} collapsed={1} />
            </Suspense>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
