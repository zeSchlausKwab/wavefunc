import { Link } from "@tanstack/react-router";
import { AnimatedLogo } from "./AnimatedLogo";
import { LoginSessionButtons } from "./LoginSessionButtom";
import { NavigationItems } from "./NavigationItems";
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
            <NavigationItems variant="desktop" />
          </nav>

          <LoginSessionButtons />
        </div>
      </div>
    </header>
  );
}
