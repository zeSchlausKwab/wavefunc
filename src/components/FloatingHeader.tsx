import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { LoginSessionButtons } from "./LoginSessionButtom";
import { isAdmin } from "../config/admins";
import { useCurrentAccount } from "../lib/nostr/auth";
import { StationManagementSheet } from "./StationManagementSheet";
import { AuthRequiredButton } from "./AuthRequiredButton";
import { SupportPopover } from "./SupportPopover";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { cn } from "@/lib/utils";

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

      {/*
        Logo + Nav: shrink-0 by content. The nav reserves its
        natural width (icons + labels at xl+) so labels never get
        clipped. Anything wider than the viewport would be solved by
        the inner overflow-x-auto, but with labels deferred to xl+ in
        practice nav always fits.
      */}
      <div className="flex items-center gap-2 md:gap-3 xl:gap-4 px-3 xl:px-4 shrink-0 border-r-4 border-on-background h-full">
        <Link to="/" search={{}} className="shrink-0">
          <div className="text-lg lg:text-xl font-black text-on-background border-4 border-on-background px-1.5 lg:px-2 py-1 rotate-[-2deg] font-headline uppercase tracking-tighter select-none shrink-0">
            WAVEFUNC
          </div>
        </Link>

        <nav className="flex gap-0.5 overflow-x-auto scrollbar-none">
          {navItems.map((item) => {
            return (
              <Link
                key={item.to}
                to={item.to}
                search={item.to === "/" ? {} : undefined}
                className={cn(navLinkBase, "shrink-0")}
                activeProps={{ className: cn(navLinkActive, "shrink-0") }}
                title={item.label}
              >
                <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
                {/*
                  Labels at xl+. The nav as a whole is shrink-0, so its
                  labelled width is always honored; the search panel
                  next door is the section that gives way under width
                  pressure (it's flex-1 + min-w-0).
                */}
                <span className="hidden xl:inline text-xs">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/*
        Search panel: flex-1 + min-w-0 so it ABSORBS the space
        unclaimed by nav and actions. A ResizeObserver inside the
        SearchSection collapses the inline input into an icon+popover
        when the panel narrows below ~14rem (input becomes unreadable
        below that — placeholder gets clipped, no room for the clear
        button). Above the threshold it renders inline as before.
      */}
      <SearchSection
        searchInput={searchInput}
        setSearchInput={setSearchInput}
        onSearch={onSearch}
      />

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
        <SupportPopover />
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

// Threshold below which the inline input is too narrow to be useful —
// at ~14rem (224px) the placeholder gets clipped and there's no room
// for the clear button. Below this we collapse to an icon-only
// trigger that opens the input in a popover.
const SEARCH_INLINE_MIN_PX = 224;

interface SearchSectionProps {
  searchInput: string;
  setSearchInput: (q: string) => void;
  onSearch: (q: string) => void;
}

function SearchSection({ searchInput, setSearchInput, onSearch }: SearchSectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  // Watch our own width — not the viewport's — because the actual
  // amount of room the search panel gets depends on what other flex
  // items are claiming. ResizeObserver fires whenever this section's
  // width changes for any reason (window resize, devtools open, etc.).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setCollapsed(w < SEARCH_INLINE_MIN_PX);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="flex items-center gap-2 lg:gap-3 px-3 lg:px-4 h-full flex-1 min-w-0 border-r-4 border-on-background"
    >
      {collapsed ? (
        <SearchPopover
          searchInput={searchInput}
          setSearchInput={setSearchInput}
          onSearch={onSearch}
        />
      ) : (
        <SearchInline
          searchInput={searchInput}
          setSearchInput={setSearchInput}
          onSearch={onSearch}
        />
      )}
    </div>
  );
}

function SearchInline({ searchInput, setSearchInput, onSearch }: SearchSectionProps) {
  return (
    <>
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
    </>
  );
}

function SearchPopover({ searchInput, setSearchInput, onSearch }: SearchSectionProps) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep focus in the popover input when it opens.
  useEffect(() => {
    if (open) {
      // next frame so the popover content is mounted
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
    return;
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-1.5 font-bold tracking-tighter uppercase px-2.5 py-1 transition-colors hover:bg-secondary-fixed-dim",
            // Highlight the trigger when there's an active query so the
            // user knows the search filter is on even though the input
            // is collapsed.
            searchInput
              ? "text-surface bg-primary"
              : "text-on-background"
          )}
          title="Search stations"
          aria-label="Search stations"
        >
          <span className="material-symbols-outlined text-[20px]">search</span>
          {searchInput && (
            <span className="text-xs max-w-[6rem] truncate">{searchInput}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[20rem] p-0 border-4 border-on-background bg-background rounded-none shadow-[6px_6px_0px_0px_rgba(29,28,19,1)]"
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b-4 border-on-background">
          <span className="material-symbols-outlined text-[20px] text-on-background/40 shrink-0">
            search
          </span>
          <input
            ref={inputRef}
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onSearch(searchInput);
                setOpen(false);
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
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
      </PopoverContent>
    </Popover>
  );
}
