import { Link } from "@tanstack/react-router";
import { LoginSessionButtons } from "./LoginSessionButtom";

interface FloatingHeaderProps {
  searchInput: string;
  setSearchInput: (query: string) => void;
  onSearch: (query: string) => void;
}

const navLinkBase =
  "font-bold tracking-tighter uppercase text-on-background px-4 py-1 hover:skew-x-6 transition-transform hover:bg-secondary-fixed-dim";
const navLinkActive =
  "font-bold tracking-tighter uppercase text-surface bg-primary px-4 py-1 -skew-x-12 transition-all";

export function FloatingHeader(_props: FloatingHeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-[60] flex items-center w-full h-14 bg-background border-b-4 border-on-background shadow-[4px_4px_0px_0px_rgba(29,28,19,1)]">
      <div className="flex-1 overflow-x-auto flex items-center gap-4 px-4 min-w-0 whitespace-nowrap scrollbar-none">
        <Link to="/" search={{}}>
          <div className="text-xl font-black text-on-background border-4 border-on-background px-2 py-1 rotate-[-2deg] font-headline uppercase tracking-tighter select-none shrink-0">
            WAVEFUNC
          </div>
        </Link>

        <nav className="flex gap-1 shrink-0">
          <Link
            to="/"
            search={{}}
            className={navLinkBase}
            activeProps={{ className: navLinkActive }}
          >
            TRANSMIT
          </Link>
          <Link
            to="/browse/genres"
            className={navLinkBase}
            activeProps={{ className: navLinkActive }}
          >
            RECEPTION
          </Link>
          <Link
            to="/favorites"
            className={navLinkBase}
            activeProps={{ className: navLinkActive }}
          >
            ARCHIVE
          </Link>
          <Link
            to="/community"
            className={navLinkBase}
            activeProps={{ className: navLinkActive }}
          >
            ASSEMBLY
          </Link>
        </nav>
      </div>

      <div className="shrink-0 px-4 border-l-4 border-on-background h-full flex items-center">
        <LoginSessionButtons />
      </div>
    </header>
  );
}
