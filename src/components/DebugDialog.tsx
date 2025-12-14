import React from "react";
import JsonView from 'react18-json-view'
import 'react18-json-view/src/style.css'
import { NDKStation } from "../lib/NDKStation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";

interface DebugDialogProps {
  station: NDKStation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const DebugDialog: React.FC<DebugDialogProps> = ({
  station,
  open,
  onOpenChange,
}) => {
  const rawEvent = station.rawEvent();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Radio Event Debug</DialogTitle>
          <DialogDescription>
            Raw Nostr event data for {station.name || "Unnamed Station"}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-auto bg-gray-50 rounded-md p-4">
          <JsonView
            src={rawEvent}
            collapsed={1}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};
