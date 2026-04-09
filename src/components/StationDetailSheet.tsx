import React from "react";
import type { ParsedStation } from "../lib/nostr/domain";
import { Sheet, SheetContent } from "./ui/sheet";
import { StationDetail } from "./StationDetail";

interface StationDetailSheetProps {
  station: ParsedStation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  focusCommentForm?: boolean;
  onCommentFormFocused?: () => void;
}

export const StationDetailSheet: React.FC<StationDetailSheetProps> = ({
  station,
  open,
  onOpenChange,
  focusCommentForm = false,
  onCommentFormFocused,
}) => {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        responsiveSide={{ mobile: "bottom", desktop: "left" }}
        className="w-full md:w-[40%] md:max-w-2xl h-[70vh] md:h-full overflow-y-auto p-0"
      >
        <StationDetail
          station={station}
          focusCommentForm={focusCommentForm}
          onCommentFormFocused={onCommentFormFocused}
        />
      </SheetContent>
    </Sheet>
  );
};
