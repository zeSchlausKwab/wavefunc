import { Link } from "@tanstack/react-router";
import { LoginSessionButtons } from "./LoginSessionButtom";

interface FloatingHeaderProps {
  searchInput: string;
  setSearchInput: (query: string) => void;
  onSearch: (query: string) => void;
}

const navLinkBase =
  "font-bold tracking-tighter uppercase text-on-background px-4 py-1 hover:skew-x-6 transition-transform hover:bg-secondary-fixed-dim whitespace-nowrap";
const navLinkActive =
  "font-bold tracking-tighter uppercase text-surface bg-primary px-4 py-1 -skew-x-12 transition-all whitespace-nowrap";

export function FloatingHeader({ searchInput, setSearchInput, onSearch }: FloatingHeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-[60] flex items-center w-full h-14 bg-background border-b-4 border-on-background shadow-[4px_4px_0px_0px_rgba(29,28,19,1)]">

      {/* Logo + Nav */}
      <div className="flex items-center gap-4 px-4 shrink-0 whitespace-nowrap border-r-4 border-on-background h-full overflow-x-auto scrollbar-none">
        <Link to="/" search={{}}>
          <div className="text-xl font-black text-on-background border-4 border-on-background px-2 py-1 rotate-[-2deg] font-headline uppercase tracking-tighter select-none shrink-0">
            WAVEFUNC
          </div>
        </Link>

        <nav className="hidden md:flex gap-1 shrink-0">
          <Link to="/" search={{}} className={navLinkBase} activeProps={{ className: navLinkActive }}>
            TRANSMIT
          </Link>
          <Link to="/browse/genres" className={navLinkBase} activeProps={{ className: navLinkActive }}>
            RECEPTION
          </Link>
          <Link to="/favorites" className={navLinkBase} activeProps={{ className: navLinkActive }}>
            ARCHIVE
          </Link>
          <Link to="/community" className={navLinkBase} activeProps={{ className: navLinkActive }}>
            ASSEMBLY
          </Link>
        </nav>
      </div>

      {/* Search — hidden on mobile, handled by FloatingSearchButton */}
      <div className="hidden md:flex flex-1 items-center gap-3 px-4 h-full">
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

      {/* Login */}
      <div className="shrink-0 px-4 border-l-4 border-on-background h-full flex items-center">
        <LoginSessionButtons />
      </div>

    </header>
  );
}
