import { Link } from "@tanstack/react-router";
import { Heart, Menu, Plus, Music } from "lucide-react";
import { useState } from "react";
import { useMedia } from "react-use";
import { useFavorites } from "../lib/hooks/useFavorites";
import { AnimatedLogo } from "./AnimatedLogo";
import { AuthRequiredButton } from "./AuthRequiredButton";
import { LoginSessionButtons } from "./LoginSessionButtom";
import { StationManagementSheet } from "./StationManagementSheet";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetTrigger } from "./ui/sheet";
import { UnifiedSearchInput } from "./UnifiedSearchInput";
import { StarIcon } from "./ui/icons/lucide-star";
import { SpeechIcon } from "./ui/icons/lucide-speech";
import { usePlatform } from "@/lib/hooks/usePlatform";

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
  const isMobile = useMedia("(max-width: 768px)");
  const { isTauri } = usePlatform();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { getFavoriteCount } = useFavorites();

  return (
    <header className="fixed flex items-center top-1 left-1 right-1 md:top-2 md:left-2 md:right-2 z-50 border-brutal h-[7vh] bg-white/30 dark:bg-gray-900/30 backdrop-blur-xl shadow-brutal">
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
          {!isMobile ? (
            <>
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
            </>
          ) : (
            /* Mobile Layout */
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button aria-label="Toggle menu">
                  <Menu className="h-6 w-6" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="top"
                className="backdrop-blur-xl p-4 bg-white/30 dark:bg-gray-900/30 border-brutal shadow-brutal"
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
                      className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-gray-200/50 dark:hover:bg-gray-700/50 rounded-lg transition-colors"
                      activeProps={{
                        className:
                          "px-4 py-2 text-sm text-foreground font-medium bg-gray-200/50 dark:bg-gray-700/50 rounded-lg",
                      }}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Home
                    </Link>
                    <Link
                      to="/browse/genres"
                      className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-gray-200/50 dark:hover:bg-gray-700/50 rounded-lg transition-colors flex items-center gap-2"
                      activeProps={{
                        className:
                          "px-4 py-2 text-sm text-foreground font-medium bg-gray-200/50 dark:bg-gray-700/50 rounded-lg flex items-center gap-2",
                      }}
                      onClick={() => setMobileMenuOpen(false)}
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
                      onClick={() => setMobileMenuOpen(false)}
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
                      onClick={() => setMobileMenuOpen(false)}
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
          )}
        </div>
      </div>
    </header>
  );
}
