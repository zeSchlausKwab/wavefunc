import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  getFavoritesListAddress,
  getFavoritesListStationCount,
  type ParsedFavoritesList,
} from "../../lib/nostr/domain";

interface FavoritesListPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allLists: ParsedFavoritesList[];
  eose: boolean;
  /** Addresses already referenced — these are shown as already-added */
  existingRefs: string[];
  onSelect: (list: ParsedFavoritesList) => void;
}

export function FavoritesListPicker({
  open,
  onOpenChange,
  allLists,
  eose,
  existingRefs,
  onSelect,
}: FavoritesListPickerProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return allLists.filter((list) => {
      if (!q) return true;
      return (
        list.name?.toLowerCase().includes(q) ||
        list.description?.toLowerCase().includes(q)
      );
    });
  }, [allLists, query]);

  const handleSelect = (list: ParsedFavoritesList) => {
    onSelect(list);
    onOpenChange(false);
    setQuery("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-4 border-on-background shadow-[8px_8px_0px_0px_rgba(29,28,19,1)] rounded-none bg-surface p-0">
        <DialogHeader className="border-b-4 border-on-background px-6 pt-6 pb-4">
          <DialogTitle className="font-black uppercase tracking-tighter text-2xl">
            SELECT_FAVOURITES_LIST
          </DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="px-6 pt-4 border-b-2 border-on-background/20">
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="FILTER_LISTS..."
            className="w-full bg-transparent text-sm font-bold uppercase tracking-tight outline-none placeholder:text-on-background/25 pb-3"
          />
        </div>

        {/* List */}
        <div className="overflow-y-auto max-h-[400px] divide-y-2 divide-on-background/10">
          {!eose && (
            <div className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-on-background/40 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm animate-spin">sync</span>
              LOADING...
            </div>
          )}
          {eose && filtered.length === 0 && (
            <div className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-on-background/40">
              NO_LISTS_FOUND
            </div>
          )}
          {filtered.map((list) => {
            const address = getFavoritesListAddress(list);
            const alreadyAdded = existingRefs.includes(address);
            return (
              <button
                key={list.favoritesId ?? list.id}
                disabled={alreadyAdded}
                onClick={() => handleSelect(list)}
                className="w-full text-left px-6 py-3 flex items-center justify-between hover:bg-surface-container-high transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <div className="min-w-0">
                  <p className="font-black uppercase tracking-tight truncate">
                    {list.name ?? "UNTITLED"}
                  </p>
                  {list.description && (
                    <p className="text-xs text-on-background/50 truncate mt-0.5">
                      {list.description}
                    </p>
                  )}
                  <p className="text-[10px] font-bold tracking-widest text-on-background/30 mt-0.5">
                    {getFavoritesListStationCount(list)} STATION{getFavoritesListStationCount(list) !== 1 ? "S" : ""}
                  </p>
                </div>
                {alreadyAdded ? (
                  <span className="text-[10px] font-bold uppercase tracking-widest text-on-background/40 shrink-0 ml-4">
                    ADDED
                  </span>
                ) : (
                  <span className="material-symbols-outlined text-sm shrink-0 ml-4 text-primary">
                    add
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
