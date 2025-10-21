import { Check, Plus } from "lucide-react";
import { useState } from "react";
import { useFavorites } from "../lib/hooks/useFavorites";
import { NDKStation } from "../lib/NDKStation";
import { Button } from "./ui/button";
import { SquareChevronDownIcon } from "./ui/icons/lucide-square-chevron-down";
import { StarIcon } from "./ui/icons/lucide-star";
import { Input } from "./ui/input";

interface FavoritesDropdownProps {
  station: NDKStation;
  onAddToList: (listId: string) => Promise<void>;
  onRemoveFromList: (listId: string) => Promise<void>;
}

export const FavoritesDropdown: React.FC<FavoritesDropdownProps> = ({
  station,
  onAddToList,
  onRemoveFromList,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListDescription, setNewListDescription] = useState("");
  const { favoritesLists, createFavoritesList } = useFavorites();

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;

    const newList = await createFavoritesList(newListName, newListDescription);
    if (newList) {
      // Add station to the new list
      await onAddToList(newList.favoritesId!);
      setShowCreateForm(false);
      setNewListName("");
      setNewListDescription("");
      setIsOpen(false);
    }
  };

  const handleToggleInList = async (listId: string) => {
    if (isInList(listId)) {
      await onRemoveFromList(listId);
    } else {
      await onAddToList(listId);
    }
  };

  const isInList = (listId: string) => {
    if (!station.pubkey || !station.stationId) return false;
    const stationAddress = `31237:${station.pubkey}:${station.stationId}`;
    const list = favoritesLists.find(l => l.favoritesId === listId);
    return list ? list.hasStation(stationAddress) : false;
  };

  const hasAnyFavorites = favoritesLists.some(list => isInList(list.favoritesId!));
  
  return (
    <div className="relative">
        <Button
          variant="secondary"
          onClick={() => setIsOpen(!isOpen)}
          title="Add to favorites"
        >
          <StarIcon className={`w-4 h-4 transition-colors ${
            hasAnyFavorites ? "text-yellow-500 fill-yellow-500" : "text-gray-400"
          }`} />
          <SquareChevronDownIcon className="w-3 h-3 text-gray-500" />
        </Button>

        {isOpen && (
          <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-gray-200 rounded-lg shadow-xl z-50">
            <div className="p-3">
              <div className="text-sm font-semibold text-gray-900 mb-3">
                Add to Favorites List
              </div>
              
              {favoritesLists.length === 0 ? (
                <div className="text-sm text-gray-500 text-center py-4">
                  No favorites lists yet. Create one below!
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {favoritesLists.map((list) => (
                    <div
                      key={list.favoritesId}
                      className={`flex items-center p-3 rounded-lg border transition-colors cursor-pointer ${
                        isInList(list.favoritesId!)
                          ? "bg-blue-50 border-blue-200 hover:bg-blue-100"
                          : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                      }`}
                      onClick={() => handleToggleInList(list.favoritesId!)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {list.name}
                        </div>
                        {list.description && (
                          <div className="text-xs text-gray-500 truncate mt-1">
                            {list.description}
                          </div>
                        )}
                        <div className="text-xs text-gray-400 mt-1">
                          {list.getStationCount()} stations
                        </div>
                      </div>
                      <div className="ml-3">
                        {isInList(list.favoritesId!) ? (
                          <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                            <Check className="w-4 h-4 text-white" />
                          </div>
                        ) : (
                          <div className="w-6 h-6 border-2 border-gray-300 rounded-full" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t pt-3 mt-3">
                {!showCreateForm ? (
                  <Button
                    onClick={() => setShowCreateForm(true)}
                  >
                    <Plus className="w-4 h-4" />
                    Create New List
                  </Button>
                ) : (
                  <form onSubmit={handleCreateList} className="space-y-3">
                    <Input
                      type="text"
                      placeholder="List name (e.g., Jazz Stations)"
                      value={newListName}
                      onChange={(e) => setNewListName(e.target.value)}
                      autoFocus
                    />
                    <Input
                      type="text"
                      placeholder="Description (optional)"
                      value={newListDescription}
                      onChange={(e) => setNewListDescription(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button
                        type="submit"
                        size="sm"
                        disabled={!newListName.trim()}
                        className="flex-1"
                      >
                        Create & Add
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setShowCreateForm(false);
                          setNewListName("");
                          setNewListDescription("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        )}

      {/* Backdrop to close dropdown */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
};