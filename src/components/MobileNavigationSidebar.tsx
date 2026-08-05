import { LoginSessionButtons } from "./LoginSessionButtom";
import { NavigationItems } from "./NavigationItems";
import { SleepTimerButton } from "./SleepTimerButton";
import { UnifiedSearchInput } from "./UnifiedSearchInput";
import { PlayerDiagnostics, useDiagnosticsEnabled } from "./PlayerDiagnostics";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "./ui/sheet";
import { useUIStore } from "../stores/uiStore";

interface MobileNavigationSidebarProps {
  searchInput: string;
  setSearchInput: (query: string) => void;
  onSearch: (query: string) => void;
}

/**
 * App-wide mobile navigation. The player owns the external WF trigger, while
 * this component owns the accessible, animated off-canvas surface.
 *
 * It intentionally does not contain station detail: navigation is global app
 * chrome, while a station is contextual content and remains in its bottom
 * sheet above the persistent player.
 */
export function MobileNavigationSidebar({
  searchInput,
  setSearchInput,
  onSearch,
}: MobileNavigationSidebarProps) {
  const open = useUIStore((state) => state.sidebarOpen);
  const closeSidebar = useUIStore((state) => state.closeSidebar);
  const diagnosticsEnabled = useDiagnosticsEnabled();

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) closeSidebar();
      }}
    >
      <SheetContent
        id="mobile-navigation-sidebar"
        side="left"
        showCloseButton={false}
        className="md:hidden w-[88vw] max-w-sm gap-0 overflow-hidden border-r-4 border-on-background bg-surface p-0 shadow-[10px_0_0_0_rgba(29,28,19,0.25)]"
      >
        <SheetTitle className="sr-only">WaveFunc navigation</SheetTitle>
        <SheetDescription className="sr-only">
          Navigate WaveFunc, manage your account, search stations, and access
          playback tools.
        </SheetDescription>

        <header className="shrink-0 border-b-4 border-on-background bg-background pt-[env(safe-area-inset-top)]">
          <div className="flex min-h-14 items-stretch border-b-2 border-on-background/15">
            <div className="flex min-w-0 flex-1 items-center px-4">
              <div className="border-4 border-on-background px-2 py-0.5 font-headline text-xl font-black uppercase tracking-tighter -rotate-2">
                WAVEFUNC
              </div>
            </div>
            <SheetClose asChild>
              <button
                type="button"
                className="flex w-14 shrink-0 items-center justify-center border-l-2 border-on-background/15 transition-colors hover:bg-primary hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
                aria-label="Close navigation"
              >
                <span className="material-symbols-outlined text-[24px]">
                  close
                </span>
              </button>
            </SheetClose>
          </div>

          <div className="px-4 py-3">
            <div className="mb-2 text-[9px] font-black uppercase tracking-[0.22em] text-on-background/45">
              IDENTITY_CHANNEL
            </div>
            <LoginSessionButtons onNavigate={closeSidebar} />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain pb-[calc(5rem+env(safe-area-inset-bottom))]">
          <div className="border-b-2 border-on-background/10 px-4 py-3">
            <UnifiedSearchInput
              searchInput={searchInput}
              setSearchInput={setSearchInput}
              onStationSearch={(query) => {
                onSearch(query);
                closeSidebar();
              }}
            />
          </div>

          <nav className="flex flex-col" aria-label="Mobile navigation">
            <NavigationItems variant="mobile" onNavigate={closeSidebar} />
          </nav>

          <SleepTimerButton variant="full" />

          {diagnosticsEnabled && <PlayerDiagnostics />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
