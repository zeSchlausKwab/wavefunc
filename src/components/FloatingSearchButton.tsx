import { useState } from "react";
import { AnimatedLogo } from "./AnimatedLogo";
import { LoginSessionButtons } from "./LoginSessionButtom";
import { NavigationItems } from "./NavigationItems";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetTrigger } from "./ui/sheet";
import { UnifiedSearchInput } from "./UnifiedSearchInput";

interface FloatingSearchButtonProps {
  searchInput: string;
  setSearchInput: (query: string) => void;
  onSearch: (query: string) => void;
}

export function FloatingSearchButton({
  searchInput,
  setSearchInput,
  onSearch,
}: FloatingSearchButtonProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
      <SheetTrigger asChild>
        <Button
          size="icon"
          className="fixed bottom-[5.5rem] right-4 z-40 rounded-full size-16 p-1 bg-yellow-500"
          variant="outline"
          aria-label="Search and navigate"
        >
          <AnimatedLogo className="size-full" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="backdrop-blur-xl p-4 bg-white/30 dark:bg-gray-900/30 border-brutal shadow-brutal h-auto max-h-[75vh] overflow-y-auto pb-safe"
      >
        <div className="space-y-4 mt-4">
          {/* Unified Search */}
          <UnifiedSearchInput
            searchInput={searchInput}
            setSearchInput={setSearchInput}
            onStationSearch={onSearch}
          />

          {/* Navigation */}
          <nav className="flex flex-col gap-2">
            <NavigationItems
              variant="mobile"
              onNavigate={() => setSheetOpen(false)}
            />
          </nav>
          <LoginSessionButtons />
        </div>
      </SheetContent>
    </Sheet>
  );
}
