import { Link } from "@tanstack/react-router";
import { Heart, Menu, Plus } from "lucide-react";
import { useState } from "react";
import { useMedia } from "react-use";
import { useFavorites } from "../lib/hooks/useFavorites";
import { AnimatedLogo } from "./AnimatedLogo";
import { LoginSessionButtons } from "./LoginSessionButtom";
import { StationManagementSheet } from "./StationManagementSheet";
import { Button } from "./ui/button";
import { IconButtonInput } from "./ui/icon-button-input";
import { SearchIcon } from "./ui/icons/lucide-search";
import { XIcon } from "./ui/icons/lucide-x";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "./ui/sheet";
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
  const { getFavoriteCount } = useFavorites();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log(`🔍 Searching for: "${searchInput}"`);
    onSearch(searchInput);
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
              {/* Search Bar */}
              <form onSubmit={handleSubmit} className="flex-1 max-w-md">
                <IconButtonInput
                  type="text"
                  startIcon={{
                    icon: SearchIcon,
                    onClick: () => onSearch(searchInput),
                    disabled: !searchInput.trim(),
                    type: "submit",
                    title: "Search",
                  }}
                  endIcon={
                    searchInput
                      ? {
                          icon: XIcon,
                          onClick: () => {
                            setSearchInput("");
                            onSearch("");
                          },
                          title: "Clear search",
                        }
                      : undefined
                  }
                  value={searchInput}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchInput(e.target.value)}
                  placeholder="Search stations..."
                />
              </form>

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

              {/* Auth Buttons */}
              <div className="flex items-center gap-2">
                <WalletButton />
                <LoginSessionButtons />
              </div>
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
                  {/* Search Bar */}
                  <form onSubmit={handleSubmit}>
                    <IconButtonInput
                      type="text"
                      startIcon={{
                        icon: SearchIcon,
                        onClick: () => onSearch(searchInput),
                        disabled: !searchInput.trim(),
                        type: "submit",
                        title: "Search",
                      }}
                      endIcon={
                        searchInput
                          ? {
                              icon: XIcon,
                              onClick: () => {
                                setSearchInput("");
                                onSearch("");
                              },
                              title: "Clear search",
                            }
                          : undefined
                      }
                      value={searchInput}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchInput(e.target.value)}
                      placeholder="Search stations..."
                    />
                  </form>

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

                  {/* Auth Buttons */}
                  <div className="flex flex-col gap-2 pt-2 border-t border-gray-200/50 dark:border-gray-700/50">
                    <WalletButton />
                    <LoginSessionButtons />
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          )}
        </div>
      </div>
    </header>
  );
}
