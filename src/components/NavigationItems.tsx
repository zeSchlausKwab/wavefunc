import { Link } from "@tanstack/react-router";
import { HomeIcon, Music, Plus, Search } from "lucide-react";
import { useFavorites } from "../lib/hooks/useFavorites";
import { AuthRequiredButton } from "./AuthRequiredButton";
import { StationManagementSheet } from "./StationManagementSheet";
import { SpeechIcon } from "./ui/icons/lucide-speech";
import { StarIcon } from "./ui/icons/lucide-star";

interface NavigationItemsProps {
  onNavigate?: () => void;
  variant?: "mobile" | "desktop";
}

export function NavigationItems({
  onNavigate,
  variant = "mobile",
}: NavigationItemsProps) {
  const { getFavoriteCount } = useFavorites();

  const isMobile = variant === "mobile";

  const linkClassName = isMobile
    ? "px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-gray-200/50 dark:hover:bg-gray-700/50 rounded-lg transition-colors flex items-center gap-2"
    : "text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1";

  const activeLinkClassName = isMobile
    ? "px-4 py-2 text-sm text-foreground font-medium bg-gray-200/50 dark:bg-gray-700/50 rounded-lg flex items-center gap-2"
    : "text-foreground font-medium";

  return (
    <>
      {isMobile && (
        <Link
          to="/"
          search={{}}
          className={linkClassName}
          activeProps={{
            className: activeLinkClassName,
          }}
          onClick={onNavigate}
        >
          <HomeIcon className="w-4 h-4" />
          Home
        </Link>
      )}
      <Link
        to="/browse/genres"
        className={linkClassName}
        activeProps={{
          className: activeLinkClassName,
        }}
        onClick={onNavigate}
      >
        <Music className="w-4 h-4" />
        {isMobile ? "Browse Genres" : "Browse"}
      </Link>
      <Link
        to="/musicbrainz"
        className={linkClassName}
        activeProps={{
          className: activeLinkClassName,
        }}
        onClick={onNavigate}
      >
        <Search className="w-4 h-4" />
        {isMobile ? "Music Search" : "Search"}
      </Link>
      <Link
        to="/favorites"
        className={linkClassName}
        activeProps={{
          className: activeLinkClassName,
        }}
        onClick={onNavigate}
      >
        <StarIcon className="w-4 h-4" />
        Favorites
        {getFavoriteCount() > 0 && (
          <span
            className={`bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full ${
              isMobile ? "ml-auto" : "ml-1"
            }`}
          >
            {getFavoriteCount()}
          </span>
        )}
      </Link>
      <Link
        to="/community"
        className={linkClassName}
        activeProps={{
          className: activeLinkClassName,
        }}
        onClick={onNavigate}
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
    </>
  );
}
