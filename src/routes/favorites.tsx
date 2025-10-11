import { createFileRoute } from "@tanstack/react-router";
import { Heart, Trash2, Plus } from "lucide-react";
import { useFavorites, useFavoriteStations } from "../lib/hooks/useFavorites";
import { RadioCard } from "../components/RadioCard";
import { Button } from "../components/ui/button";
import { useState } from "react";

export const Route = createFileRoute("/favorites")({
  component: Favorites,
});

function Favorites() {
  const {
    favoritesLists,
    defaultList,
    getFavoriteCount,
    clearFavorites,
    createFavoritesList,
    isLoading: favoritesLoading,
    isLoggedIn,
  } = useFavorites();


  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListDescription, setNewListDescription] = useState("");
  const [selectedList, setSelectedList] = useState<string | null>(null);

  const favoriteCount = getFavoriteCount();
  const currentList = selectedList
    ? favoritesLists.find((list) => list.favoritesId === selectedList) || null
    : defaultList;

  const { stations, isLoading: stationsLoading } =
    useFavoriteStations(currentList);
  const isLoading = favoritesLoading || stationsLoading;

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;

    const newList = await createFavoritesList(newListName, newListDescription);
    if (newList) {
      setSelectedList(newList.favoritesId!);
      setShowCreateForm(false);
      setNewListName("");
      setNewListDescription("");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Loading favorites...</div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <Heart className="w-16 h-16 text-muted-foreground/30" />
        <h1 className="text-3xl font-bold">Favorites</h1>
        <p className="text-muted-foreground text-center max-w-md">
          Please log in to view and manage your favorite stations.
        </p>
      </div>
    );
  }

  if (favoritesLists.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center justify-center py-16 space-y-6">
          <Heart className="w-16 h-16 text-muted-foreground/30" />
          <h1 className="text-3xl font-bold">No favorites yet</h1>
          <p className="text-muted-foreground text-center max-w-md">
            Start adding stations to your favorites by clicking the heart icon
            on any station card.
          </p>

          {!showCreateForm && (
            <Button
              variant="outline"
              size="default"
              onClick={() => setShowCreateForm(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Create New List
            </Button>
          )}
        </div>

        {/* Create List Form */}
        {showCreateForm && (
          <div className="max-w-2xl mx-auto bg-muted/50 p-6 rounded-lg">
            <h2 className="text-lg font-semibold mb-4">
              Create a New Favorites List
            </h2>
            <form onSubmit={handleCreateList} className="space-y-4">
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    List Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Jazz Favorites, Road Trip Mix"
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Description (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Describe what this list is for"
                    value={newListDescription}
                    onChange={(e) => setNewListDescription(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={!newListName.trim()}>
                  Create List
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
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Lists Tabs */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Heart className="w-6 h-6 text-red-500" fill="currentColor" />
            <h1 className="text-2xl font-bold">My Favorites</h1>
            <span className="bg-muted text-muted-foreground px-2 py-1 rounded-full text-sm">
              {favoriteCount}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {!showCreateForm && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCreateForm(true)}
              >
                <Plus className="w-4 h-4 mr-2" />
                New List
              </Button>
            )}
            {favoriteCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearFavorites}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Clear All
              </Button>
            )}
          </div>
        </div>

        {/* Create List Form */}
        {showCreateForm && (
          <div className="bg-muted/50 p-4 rounded-lg">
            <form onSubmit={handleCreateList} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="List name"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
                <input
                  type="text"
                  placeholder="Description (optional)"
                  value={newListDescription}
                  onChange={(e) => setNewListDescription(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={!newListName.trim()}>
                  Create List
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
          </div>
        )}

        {/* Lists Tabs */}
        {favoritesLists.length > 0 && (
          <div className="border-b">
            <nav className="flex space-x-6 overflow-x-auto min-h-[48px]">
              <button
                onClick={() => setSelectedList(null)}
                className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  !selectedList
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                All Lists ({favoriteCount})
              </button>
              {favoritesLists.map((list) => {
                const listStationCount = list.getStationCount();
                return (
                  <button
                    key={list.favoritesId}
                    onClick={() => setSelectedList(list.favoritesId!)}
                    className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                      selectedList === list.favoritesId
                        ? "border-blue-500 text-blue-600"
                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    {list.name} ({listStationCount})
                  </button>
                );
              })}
            </nav>
          </div>
        )}
      </div>

      {/* Current List Content */}
      {currentList ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">{currentList.name}</h2>
              {currentList.description && (
                <p className="text-muted-foreground text-sm">
                  {currentList.description}
                </p>
              )}
            </div>
            <span className="text-sm text-muted-foreground">
              {stations.length} station{stations.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {stations.map((station) => (
              <RadioCard key={station.id} station={station} />
            ))}
          </div>

          {stations.length === 0 && (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                This list is empty. Start adding stations!
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">All Favorites</h2>

          {favoritesLists.map((list) => {
            const { stations: listStations } = useFavoriteStations(list);

            return (
              <div key={list.favoritesId} className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">{list.name}</h3>
                    {list.description && (
                      <p className="text-sm text-muted-foreground">
                        {list.description}
                      </p>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {listStations.length} station
                    {listStations.length !== 1 ? "s" : ""}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {listStations.slice(0, 8).map((station) => (
                    <RadioCard key={station.id} station={station} />
                  ))}
                </div>

                {listStations.length > 8 && (
                  <button
                    onClick={() => setSelectedList(list.favoritesId!)}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    View all {listStations.length} stations
                  </button>
                )}

                {listStations.length === 0 && (
                  <div className="text-center py-4 text-muted-foreground text-sm">
                    This list is empty
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
