import React from "react";
import type { NDKStation } from "../lib/NDKStation";
import { Sheet, SheetContent } from "./ui/sheet";
import { StationDetail } from "./StationDetail";

interface StationDetailSheetProps {
  station: NDKStation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  focusCommentForm?: boolean;
  onCommentFormFocused?: () => void;
}

/**
 * StationDetailSheet - Full details view for a radio station in a sheet/modal
 * Mobile: Bottom sheet (70% height)
 * Desktop: Left sheet (40% width)
 */
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
