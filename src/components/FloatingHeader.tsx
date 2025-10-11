import { LoginSessionButtons } from "./LoginSessionButtom";
import { WalletButton } from "./WalletButton";
import { useMedia } from "react-use";
import { useState } from "react";
import { AnimatedLogo } from "./AnimatedLogo";
import { Link } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { useFavorites } from "../lib/hooks/useFavorites";

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
    <header className="fixed top-1 left-1 right-1 md:top-2 md:left-2 md:right-2 z-50 border-2 border-black h-[7vh] bg-white/30 dark:bg-gray-900/30 backdrop-blur-xl shadow-2xl items-center">
      <div className="px-4 md:px-8 py-3 md:py-4">
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
                <div className="relative">
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search stations..."
                    className="w-full px-4 py-2 pr-20 text-sm bg-white/80 dark:bg-gray-800/80 border border-gray-300/50 dark:border-gray-600/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent backdrop-blur-sm transition-all"
                  />
                  {searchInput && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchInput("");
                        onSearch("");
                      }}
                      className="absolute right-10 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      title="Clear search"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={!searchInput.trim()}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
                    title="Search"
                  >
                    <svg
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  </button>
                </div>
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
              </nav>

              {/* Auth Buttons */}
              <div className="flex items-center gap-2">
                <WalletButton />
                <LoginSessionButtons />
              </div>
            </>
          ) : (
            /* Mobile Layout */
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 hover:bg-gray-200/50 dark:hover:bg-gray-700/50 rounded-lg transition-colors"
              aria-label="Toggle menu"
            >
              <svg
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                {mobileMenuOpen ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                )}
              </svg>
            </button>
          )}
        </div>

        {/* Mobile Menu - Slide down reveal */}
        {isMobile && (
          <div
            className={`overflow-hidden transition-all duration-300 ease-in-out ${
              mobileMenuOpen ? "max-h-96 mt-4" : "max-h-0"
            }`}
          >
            <div className="space-y-4 pb-2">
              {/* Search Bar */}
              <form onSubmit={handleSubmit}>
                <div className="relative">
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search stations..."
                    className="w-full px-4 py-2 pr-10 text-sm bg-white/80 dark:bg-gray-800/80 border border-gray-300/50 dark:border-gray-600/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 backdrop-blur-sm"
                  />
                  <button
                    type="submit"
                    disabled={!searchInput.trim()}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
                  >
                    <svg
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  </button>
                </div>
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
                >
                  <Heart className="w-4 h-4" />
                  Favorites
                  {getFavoriteCount() > 0 && (
                    <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full ml-auto">
                      {getFavoriteCount()}
                    </span>
                  )}
                </Link>
              </nav>

              {/* Auth Buttons */}
              <div className="flex flex-col gap-2 pt-2 border-t border-gray-200/50 dark:border-gray-700/50">
                <WalletButton />
                <LoginSessionButtons />
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
