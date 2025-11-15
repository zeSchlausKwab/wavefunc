import { Link } from "@tanstack/react-router";
import { HomeIcon, Music, Plus } from "lucide-react";
import { useState } from "react";
import { useFavorites } from "../lib/hooks/useFavorites";
import { AnimatedLogo } from "./AnimatedLogo";
import { AuthRequiredButton } from "./AuthRequiredButton";
import { LoginSessionButtons } from "./LoginSessionButtom";
import { StationManagementSheet } from "./StationManagementSheet";
import { Button } from "./ui/button";
import { SpeechIcon } from "./ui/icons/lucide-speech";
import { StarIcon } from "./ui/icons/lucide-star";
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
  const { getFavoriteCount } = useFavorites();

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
            <Link
              to="/"
              search={{}}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-gray-200/50 dark:hover:bg-gray-700/50 rounded-lg transition-colors flex items-center gap-2"
              activeProps={{
                className:
                  "px-4 py-2 text-sm text-foreground font-medium bg-gray-200/50 dark:bg-gray-700/50 rounded-lg",
              }}
              onClick={() => setSheetOpen(false)}
            >
              <HomeIcon className="w-4 h-4" />
              Home
            </Link>
            <Link
              to="/browse/genres"
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-gray-200/50 dark:hover:bg-gray-700/50 rounded-lg transition-colors flex items-center gap-2"
              activeProps={{
                className:
                  "px-4 py-2 text-sm text-foreground font-medium bg-gray-200/50 dark:bg-gray-700/50 rounded-lg flex items-center gap-2",
              }}
              onClick={() => setSheetOpen(false)}
            >
              <Music className="w-4 h-4" />
              Browse Genres
            </Link>
            <Link
              to="/favorites"
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-gray-200/50 dark:hover:bg-gray-700/50 rounded-lg transition-colors flex items-center gap-2"
              activeProps={{
                className:
                  "px-4 py-2 text-sm text-foreground font-medium bg-gray-200/50 dark:bg-gray-700/50 rounded-lg flex items-center gap-2",
              }}
              onClick={() => setSheetOpen(false)}
            >
              <StarIcon className="w-4 h-4" />
              Favorites
              {getFavoriteCount() > 0 && (
                <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full ml-auto">
                  {getFavoriteCount()}
                </span>
              )}
            </Link>
            <Link
              to="/community"
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-gray-200/50 dark:hover:bg-gray-700/50 rounded-lg transition-colors flex items-center gap-2"
              activeProps={{
                className:
                  "px-4 py-2 text-sm text-foreground font-medium bg-gray-200/50 dark:bg-gray-700/50 rounded-lg flex items-center gap-2",
              }}
              onClick={() => setSheetOpen(false)}
            >
              <SpeechIcon className="w-4 h-4" />
              Community
            </Link>
            <StationManagementSheet
              mode="add"
              trigger={
                <AuthRequiredButton loginTooltipMessage="Please log in to add a station">
                  <Plus className="w-4 h-4" />
                  Add Station
                </AuthRequiredButton>
              }
            />
          </nav>
          <LoginSessionButtons />
        </div>
      </SheetContent>
    </Sheet>
  );
}
