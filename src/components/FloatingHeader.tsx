import { Link } from "@tanstack/react-router";
import { Heart, Menu, Plus } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useMedia } from "react-use";
import { useFavorites } from "../lib/hooks/useFavorites";
import { searchMusicBrainz } from "../lib/metadataClient";
import { AnimatedLogo } from "./AnimatedLogo";
import { LoginSessionButtons } from "./LoginSessionButtom";
import { StationManagementSheet } from "./StationManagementSheet";
import { SearchModeToggle, type SearchMode } from "./SearchModeToggle";
import {
  MusicBrainzResults,
  type MusicBrainzResult,
} from "./MusicBrainzResults";
import { Button } from "./ui/button";
import { IconButtonInput } from "./ui/icon-button-input";
import { SearchIcon } from "./ui/icons/lucide-search";
import { XIcon } from "./ui/icons/lucide-x";
import { Sheet, SheetContent, SheetTrigger } from "./ui/sheet";
import { WalletButton } from "./WalletButton";

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchMode, setSearchMode] = useState<SearchMode>("stations");
  const [musicBrainzResults, setMusicBrainzResults] = useState<
    MusicBrainzResult[]
  >([]);
  const [musicBrainzLoading, setMusicBrainzLoading] = useState(false);
  const [musicBrainzError, setMusicBrainzError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const { getFavoriteCount } = useFavorites();

  // Close results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setShowResults(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Clear results when switching modes
  useEffect(() => {
    setMusicBrainzResults([]);
    setMusicBrainzError(null);
    setShowResults(false);
  }, [searchMode]);

  const handleMusicBrainzSearch = async (query: string) => {
    if (!query.trim()) {
      setMusicBrainzResults([]);
      setShowResults(false);
      return;
    }

    setMusicBrainzLoading(true);
    setMusicBrainzError(null);
    setShowResults(true);

    try {
      const data = await searchMusicBrainz({ query });
      setMusicBrainzResults(data);
    } catch (err: any) {
      setMusicBrainzError(err.message || "Failed to search MusicBrainz");
      setMusicBrainzResults([]);
    } finally {
      setMusicBrainzLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchMode === "stations") {
      console.log(`🔍 Searching stations for: "${searchInput}"`);
      onSearch(searchInput);
      setShowResults(false);
    } else {
      handleMusicBrainzSearch(searchInput);
    }
  };

  const handleClear = () => {
    setSearchInput("");
    if (searchMode === "stations") {
      onSearch("");
    } else {
      setMusicBrainzResults([]);
      setMusicBrainzError(null);
    }
    setShowResults(false);
  };

  return (
    <header className="fixed flex items-center top-1 left-1 right-1 md:top-2 md:left-2 md:right-2 z-50 border-brutal h-[7vh] bg-white/30 dark:bg-gray-900/30 backdrop-blur-xl shadow-brutal">
      <div className="p-2 md:p-6 w-full">
        <div className="flex items-center justify-between gap-4">
          <Link
            to="/"
            search={{ search: "" }}
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
              {/* Search Bar with Mode Toggle */}
              <div className="flex-1 max-w-2xl flex gap-2 items-center">
                <SearchModeToggle
                  mode={searchMode}
                  onModeChange={setSearchMode}
                />
                <div className="flex-1 relative" ref={searchContainerRef}>
                  <form onSubmit={handleSubmit}>
                    <IconButtonInput
                      type="text"
                      startIcon={{
                        icon: SearchIcon,
                        onClick: () =>
                          handleSubmit({
                            preventDefault: () => {},
                          } as React.FormEvent),
                        disabled: !searchInput.trim(),
                        type: "submit",
                        title: "Search",
                      }}
                      endIcon={
                        searchInput
                          ? {
                              icon: XIcon,
                              onClick: handleClear,
                              title: "Clear search",
                            }
                          : undefined
                      }
                      value={searchInput}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setSearchInput(e.target.value)
                      }
                      placeholder={
                        searchMode === "stations"
                          ? "Search stations..."
                          : "Search artists or tracks..."
                      }
                    />
                  </form>
                  {/* MusicBrainz Results Dropdown */}
                  {searchMode === "musicbrainz" && showResults && (
                    <MusicBrainzResults
                      results={musicBrainzResults}
                      loading={musicBrainzLoading}
                      error={musicBrainzError}
                    />
                  )}
                </div>
              </div>

              {/* Navigation */}
              <nav className="flex items-center gap-6">
                <Link
                  to="/favorites"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                  activeProps={{
                    className: "text-foreground font-medium",
                  }}
                >
                  <Heart className="w-4 h-4" />
                  Favorites
                  {getFavoriteCount() > 0 && (
                    <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full ml-1">
                      {getFavoriteCount()}
                    </span>
                  )}
                </Link>

                <StationManagementSheet
                  mode="add"
                  trigger={
                    <Button>
                      <Plus className="w-4 h-4" />
                      Add Station
                    </Button>
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
                  {/* Search Mode Toggle */}
                  <SearchModeToggle
                    mode={searchMode}
                    onModeChange={setSearchMode}
                  />

                  {/* Search Bar */}
                  <div className="relative" ref={searchContainerRef}>
                    <form onSubmit={handleSubmit}>
                      <IconButtonInput
                        type="text"
                        startIcon={{
                          icon: SearchIcon,
                          onClick: () =>
                            handleSubmit({
                              preventDefault: () => {},
                            } as React.FormEvent),
                          disabled: !searchInput.trim(),
                          type: "submit",
                          title: "Search",
                        }}
                        endIcon={
                          searchInput
                            ? {
                                icon: XIcon,
                                onClick: handleClear,
                                title: "Clear search",
                              }
                            : undefined
                        }
                        value={searchInput}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setSearchInput(e.target.value)
                        }
                        placeholder={
                          searchMode === "stations"
                            ? "Search stations..."
                            : "Search artists or tracks..."
                        }
                      />
                    </form>
                    {/* MusicBrainz Results Dropdown */}
                    {searchMode === "musicbrainz" && showResults && (
                      <MusicBrainzResults
                        results={musicBrainzResults}
                        loading={musicBrainzLoading}
                        error={musicBrainzError}
                      />
                    )}
                  </div>

                  {/* Navigation */}
                  <nav className="flex flex-col gap-2">
                    <Link
                      to="/"
                      search={{ search: "" }}
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
                      to="/favorites"
                      className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-gray-200/50 dark:hover:bg-gray-700/50 rounded-lg transition-colors flex items-center gap-2"
                      activeProps={{
                        className:
                          "px-4 py-2 text-sm text-foreground font-medium bg-gray-200/50 dark:bg-gray-700/50 rounded-lg flex items-center gap-2",
                      }}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <Heart className="w-4 h-4" />
                      Favorites
                      {getFavoriteCount() > 0 && (
                        <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full ml-auto">
                          {getFavoriteCount()}
                        </span>
                      )}
                    </Link>

                    <StationManagementSheet
                      mode="add"
                      trigger={
                        <Button>
                          <Plus className="w-4 h-4" />
                          Add Station
                        </Button>
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
