import { useState } from "react";
import { useFavorites } from "../lib/hooks/useFavorites";
import type { ParsedStation } from "../lib/nostr/domain";
import {
  getFavoritesListStationCount,
  hasFavoriteStation,
} from "../lib/nostr/domain";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface FavoritesDropdownProps {
  station: ParsedStation;
  onAddToList: (listId: string) => Promise<void>;
  onRemoveFromList: (listId: string) => Promise<void>;
  /** className applied to the trigger button */
  triggerClassName?: string;
  /** material-symbols size class, e.g. "text-xl" or "text-[18px]" */
  iconSize?: string;
}

export const FavoritesDropdown: React.FC<FavoritesDropdownProps> = ({
  station,
  onAddToList,
  onRemoveFromList,
  triggerClassName = "w-full py-2.5 flex items-center justify-center",
  iconSize = "text-xl",
}) => {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const { favoritesLists, createFavoritesList } = useFavorites();

  const isInList = (listId: string): boolean => {
    if (!station.pubkey || !station.stationId) return false;
    const addr = `31237:${station.pubkey}:${station.stationId}`;
    const list = favoritesLists.find((entry) => entry.favoritesId === listId);
    return list ? hasFavoriteStation(list, addr) : false;
  };

  const hasAny = favoritesLists.some((l) => l.favoritesId && isInList(l.favoritesId));

  const handleToggle = async (listId: string) => {
    setBusy(true);
    try {
      if (isInList(listId)) await onRemoveFromList(listId);
      else await onAddToList(listId);
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const list = await createFavoritesList(newName.trim());
      if (list?.favoritesId) {
        await onAddToList(list.favoritesId);
        setShowCreate(false);
        setNewName("");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(triggerClassName, "outline-none")}>
        <span
          className={cn("material-symbols-outlined", iconSize, hasAny && "text-primary")}
          style={hasAny ? { fontVariationSettings: "'FILL' 1" } : {}}
        >
          star
        </span>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={4}
        className="w-64 rounded-none border-4 border-on-background bg-surface shadow-[8px_8px_0px_0px_rgba(29,28,19,1)] p-0 z-[200]"
      >
        {/* Header */}
        <div className="px-4 py-2 border-b-4 border-on-background bg-surface-container-high">
          <p className="text-[10px] font-black uppercase tracking-widest">ADD_TO_COLLECTION</p>
        </div>

        {/* List items */}
        <div className="max-h-52 overflow-y-auto divide-y divide-on-background/10">
          {favoritesLists.length === 0 ? (
            <p className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-background/40">
              NO_LISTS — CREATE ONE BELOW
            </p>
          ) : (
            favoritesLists.map((list) => {
              if (!list.favoritesId) return null;
              const inList = isInList(list.favoritesId);
              return (
                <button
                  key={list.favoritesId}
                  disabled={busy}
                  onClick={() => handleToggle(list.favoritesId!)}
                  className={cn(
                    "w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors disabled:opacity-40",
                    inList
                      ? "bg-on-background text-surface hover:bg-on-background/80"
                      : "hover:bg-surface-container-high"
                  )}
                >
                  <div className="min-w-0 mr-3">
                    <p className="text-xs font-black uppercase tracking-tight truncate">
                      {list.name ?? "UNTITLED"}
                    </p>
                    <p
                      className={cn(
                        "text-[10px] font-bold uppercase tracking-widest mt-0.5",
                        inList ? "text-surface/50" : "text-on-background/40"
                      )}
                    >
                      {getFavoritesListStationCount(list)} STATION{getFavoritesListStationCount(list) !== 1 ? "S" : ""}
                    </p>
                  </div>
                  <span
                    className={cn("material-symbols-outlined text-sm shrink-0", inList && "text-surface")}
                    style={inList ? { fontVariationSettings: "'FILL' 1" } : {}}
                  >
                    {inList ? "check_circle" : "add_circle"}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Create new list */}
        <div className="border-t-4 border-on-background">
          {!showCreate ? (
            <button
              onClick={() => setShowCreate(true)}
              className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-surface-container-high transition-colors"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              <span className="text-xs font-black uppercase tracking-tight">NEW_LIST</span>
            </button>
          ) : (
            <div className="px-4 py-3 space-y-2">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") {
                    setShowCreate(false);
                    setNewName("");
                  }
                }}
                placeholder="LIST_NAME..."
                className="w-full bg-surface-container-low border-2 border-on-background px-2 py-1.5 text-xs font-bold uppercase tracking-tight outline-none placeholder:text-on-background/30"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim() || busy}
                  className="flex-1 text-[10px] font-black uppercase py-1.5 bg-on-background text-surface hover:bg-primary transition-colors disabled:opacity-30"
                >
                  CREATE
                </button>
                <button
                  onClick={() => {
                    setShowCreate(false);
                    setNewName("");
                  }}
                  className="text-[10px] font-bold uppercase px-3 py-1.5 border-2 border-on-background hover:bg-surface-container-high transition-colors"
                >
                  ×
                </button>
              </div>
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
