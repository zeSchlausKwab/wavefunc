import { Link } from "@tanstack/react-router";
import { useFavorites } from "../lib/hooks/useFavorites";
import { useSongFavorites } from "../lib/hooks/useSongFavorites";
import { getSongListSongCount } from "../lib/nostr/domain/song-list";
import { AuthRequiredButton } from "./AuthRequiredButton";
import { StationManagementSheet } from "./StationManagementSheet";
import { SupportTrigger } from "./SupportPopover";
import {
  getNavigationItems,
  type NavigationBadge,
} from "../config/navigation";

interface NavigationItemsProps {
  onNavigate?: () => void;
  variant?: "mobile" | "desktop";
}

export function NavigationItems({ onNavigate, variant = "mobile" }: NavigationItemsProps) {
  const { getFavoriteCount } = useFavorites();
  const favCount = getFavoriteCount();
  const { songLists } = useSongFavorites();
  const songCount = songLists.reduce(
    (count, list) => count + getSongListSongCount(list),
    0,
  );

  // Desktop nav is in FloatingHeader
  if (variant === "desktop") return null;

  const navItems = getNavigationItems("mobile");
  const badgeCount: Record<NavigationBadge, number> = {
    "station-favorites": favCount,
    "song-favorites": songCount,
  };

  const linkCls =
    "flex items-center gap-3 px-5 py-3.5 font-black uppercase tracking-tight text-sm border-b-2 border-on-background/10 hover:bg-on-background hover:text-surface transition-colors";
  const activeCls =
    "flex items-center gap-3 px-5 py-3.5 font-black uppercase tracking-tight text-sm border-b-2 border-primary bg-primary text-white";

  return (
    <>
      {navItems.map((item) => {
        const count = item.badge ? badgeCount[item.badge] : 0;
        return (
          <Link
            key={item.to}
            to={item.to}
            search={item.to === "/" ? {} : undefined}
            className={linkCls}
            activeProps={{ className: activeCls }}
            onClick={onNavigate}
          >
            <span className="material-symbols-outlined text-[20px]">
              {item.icon}
            </span>
            {item.label}
            {item.badge && count > 0 && (
              <span
                className={
                  item.badge === "station-favorites"
                    ? "ml-auto bg-primary text-white text-[10px] font-black px-2 py-0.5 min-w-[1.5rem] text-center"
                    : "ml-auto bg-secondary-fixed-dim text-on-background text-[10px] font-black px-2 py-0.5 min-w-[1.5rem] text-center"
                }
              >
                {count}
              </span>
            )}
          </Link>
        );
      })}

    <div className="px-5 py-4 border-t-4 border-on-background mt-2 flex flex-col gap-3">
        <StationManagementSheet
          mode="add"
          trigger={
            <AuthRequiredButton loginTooltipMessage="Please log in to add a station">
              <span className="material-symbols-outlined text-[18px]">add</span>
              ADD_STATION
            </AuthRequiredButton>
          }
        />
        <SupportTrigger variant="menu" onOpen={onNavigate} />
      </div>
    </>
  );
}
