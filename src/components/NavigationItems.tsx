import { Link } from "@tanstack/react-router";
import { useFavorites } from "../lib/hooks/useFavorites";
import { AuthRequiredButton } from "./AuthRequiredButton";
import { StationManagementSheet } from "./StationManagementSheet";

interface NavigationItemsProps {
  onNavigate?: () => void;
  variant?: "mobile" | "desktop";
}

export function NavigationItems({ onNavigate, variant = "mobile" }: NavigationItemsProps) {
  const { getFavoriteCount } = useFavorites();
  const favCount = getFavoriteCount();

  // Desktop nav is in FloatingHeader
  if (variant === "desktop") return null;

  const linkCls =
    "flex items-center gap-3 px-5 py-3.5 font-black uppercase tracking-tight text-sm border-b-2 border-on-background/10 hover:bg-on-background hover:text-surface transition-colors";
  const activeCls =
    "flex items-center gap-3 px-5 py-3.5 font-black uppercase tracking-tight text-sm border-b-2 border-primary bg-primary text-white";

  return (
    <>
      <Link to="/" search={{}} className={linkCls} activeProps={{ className: activeCls }} onClick={onNavigate}>
        <span className="material-symbols-outlined text-[20px]">home</span>
        TRANSMIT
      </Link>
      <Link to="/browse/genres" className={linkCls} activeProps={{ className: activeCls }} onClick={onNavigate}>
        <span className="material-symbols-outlined text-[20px]">music_note</span>
        RECEPTION
      </Link>
      <Link to="/musicbrainz" className={linkCls} activeProps={{ className: activeCls }} onClick={onNavigate}>
        <span className="material-symbols-outlined text-[20px]">search</span>
        MUSIC_SEARCH
      </Link>
      <Link to="/favorites" className={linkCls} activeProps={{ className: activeCls }} onClick={onNavigate}>
        <span className="material-symbols-outlined text-[20px]">star</span>
        ARCHIVE
        {favCount > 0 && (
          <span className="ml-auto bg-primary text-white text-[10px] font-black px-2 py-0.5 min-w-[1.5rem] text-center">
            {favCount}
          </span>
        )}
      </Link>
      <Link to="/community" className={linkCls} activeProps={{ className: activeCls }} onClick={onNavigate}>
        <span className="material-symbols-outlined text-[20px]">forum</span>
        ASSEMBLY
      </Link>

      <div className="px-5 py-4 border-t-4 border-on-background mt-2">
        <StationManagementSheet
          mode="add"
          trigger={
            <AuthRequiredButton loginTooltipMessage="Please log in to add a station">
              <span className="material-symbols-outlined text-[18px]">add</span>
              ADD_STATION
            </AuthRequiredButton>
          }
        />
      </div>
    </>
  );
}
