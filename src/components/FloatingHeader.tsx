import { Link } from "@tanstack/react-router";
import { Music, Plus, Search } from "lucide-react";
import { useFavorites } from "../lib/hooks/useFavorites";
import { AnimatedLogo } from "./AnimatedLogo";
import { AuthRequiredButton } from "./AuthRequiredButton";
import { LoginSessionButtons } from "./LoginSessionButtom";
import { StationManagementSheet } from "./StationManagementSheet";
import { SpeechIcon } from "./ui/icons/lucide-speech";
import { StarIcon } from "./ui/icons/lucide-star";
import { UnifiedSearchInput } from "./UnifiedSearchInput";

interface FloatingHeaderProps {
  searchInput: string;
  setSearchInput: (query: string) => void;
  onSearch: (query: string) => void;
}

export function FloatingHeader({
  searchInput,
  setSearchInput,
  onSearch,
}: FloatingHeaderProps) {
  const { getFavoriteCount } = useFavorites();

  return (
    <header className="fixed flex items-center top-1 left-1 right-1 md:top-2 md:left-2 md:right-2 z-50 border-brutal h-[7vh] bg-white/30 dark:bg-gray-900/30 backdrop-blur-xl shadow-brutal hidden md:flex">
      <div className="p-2 md:p-6 w-full">
        <div className="flex items-center justify-between gap-4">
          <Link
            to="/"
            search={{}}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors w-24 h-8"
            activeProps={{
              className: "text-foreground font-medium",
            }}
          >
            <AnimatedLogo />
          </Link>

          {/* Desktop Layout */}
          {/* Unified Search */}
          <div className="flex-1 max-w-2xl">
            <UnifiedSearchInput
              searchInput={searchInput}
              setSearchInput={setSearchInput}
              onStationSearch={onSearch}
            />
          </div>

          {/* Navigation */}
          <nav className="flex items-center gap-6">
            <Link
              to="/browse/genres"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              activeProps={{
                className: "text-foreground font-medium",
              }}
            >
              <Music className="w-4 h-4" />
              Browse
            </Link>
            <Link
              to="/musicbrainz"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              activeProps={{
                className: "text-foreground font-medium",
              }}
            >
              <Search className="w-4 h-4" />
              Search
            </Link>
            <Link
              to="/favorites"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              activeProps={{
                className: "text-foreground font-medium",
              }}
            >
              <StarIcon className="w-4 h-4" />
              Favorites
              {getFavoriteCount() > 0 && (
                <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full ml-1">
                  {getFavoriteCount()}
                </span>
              )}
            </Link>
            <Link
              to="/community"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              activeProps={{
                className: "text-foreground font-medium",
              }}
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
      </div>
    </header>
  );
}
