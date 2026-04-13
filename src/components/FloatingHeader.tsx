import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { LoginSessionButtons } from "./LoginSessionButtom";
import { isAdmin } from "../config/admins";
import { useCurrentAccount } from "../lib/nostr/auth";
import { StationManagementSheet } from "./StationManagementSheet";
import { AuthRequiredButton } from "./AuthRequiredButton";

interface FloatingHeaderProps {
  searchInput: string;
  setSearchInput: (query: string) => void;
  onSearch: (query: string) => void;
}

const NAV_ITEMS: {
  to: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
}[] = [
  { to: "/", label: "TRANSMIT", icon: "home" },
  { to: "/browse/genres", label: "RECEPTION", icon: "music_note" },
  { to: "/favorites", label: "ARCHIVE", icon: "star" },
  { to: "/crate", label: "CRATE", icon: "album" },
  { to: "/signals", label: "SIGNALS", icon: "graphic_eq" },
  { to: "/community", label: "ASSEMBLY", icon: "forum" },
  { to: "/admin", label: "CONTROL", icon: "admin_panel_settings", adminOnly: true },
];

const navLinkBase =
  "flex items-center gap-1.5 font-bold tracking-tighter uppercase text-on-background px-2.5 lg:px-3 py-1 hover:skew-x-6 transition-transform hover:bg-secondary-fixed-dim whitespace-nowrap";
const navLinkActive =
  "flex items-center gap-1.5 font-bold tracking-tighter uppercase text-surface bg-primary px-2.5 lg:px-3 py-1 -skew-x-12 transition-all whitespace-nowrap";

export function FloatingHeader({ searchInput, setSearchInput, onSearch }: FloatingHeaderProps) {
  const currentUser = useCurrentAccount();
  const adminUser = isAdmin(currentUser?.pubkey);
  const navItems = useMemo(
    () => NAV_ITEMS.filter((item) => !item.adminOnly || adminUser),
    [adminUser]
  );

  return (
    <header className="hidden md:flex fixed top-0 left-0 right-0 z-[60] items-center w-full h-14 bg-background border-b-4 border-on-background shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] overflow-hidden">

      {/* Logo + Nav */}
      <div className="flex items-center gap-2 md:gap-3 xl:gap-4 px-3 xl:px-4 min-w-0 flex-1 border-r-4 border-on-background h-full">
        <Link to="/" search={{}}>
          <div className="text-lg lg:text-xl font-black text-on-background border-4 border-on-background px-1.5 lg:px-2 py-1 rotate-[-2deg] font-headline uppercase tracking-tighter select-none shrink-0">
            WAVEFUNC
          </div>
        </Link>

        <nav className="flex gap-0.5 min-w-0 overflow-hidden">
          {navItems.map((item) => {
            return (
              <Link
                key={item.to}
                to={item.to}
                search={item.to === "/" ? {} : undefined}
                className={navLinkBase}
                activeProps={{ className: navLinkActive }}
              >
                <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
                <span className="hidden xl:inline text-xs">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 lg:gap-3 px-3 lg:px-4 h-full min-w-0 basis-[9.5rem] lg:basis-[12rem] xl:basis-[16rem] 2xl:flex-1 border-r-4 border-on-background">
        <span className="material-symbols-outlined text-[20px] text-on-background/40 shrink-0">
          search
        </span>
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearch(searchInput)}
          placeholder="SEARCH_STATIONS..."
          className="flex-1 bg-transparent text-sm font-bold uppercase tracking-tight outline-none placeholder:text-on-background/25 font-headline min-w-0"
        />
        {searchInput && (
          <button
            onClick={() => { setSearchInput(""); onSearch(""); }}
            className="shrink-0 text-on-background/50 hover:text-primary transition-colors"
            title="Clear search"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        )}
      </div>

      {/* Actions + Login */}
      <div className="shrink-0 px-2 lg:px-3 h-full flex items-center gap-1 overflow-hidden">
        <StationManagementSheet
          mode="add"
          trigger={
            <AuthRequiredButton
              loginTooltipMessage="Log in to add a station"
              className={navLinkBase}
              title="Add station"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
            </AuthRequiredButton>
          }
        />
        <Link
          to="/apps"
          className={navLinkBase}
          activeProps={{ className: navLinkActive }}
          title="Download apps"
        >
          <span className="material-symbols-outlined text-[18px]">download</span>
        </Link>
        <LoginSessionButtons />
      </div>

    </header>
  );
}
