import { createFileRoute } from "@tanstack/react-router";
import { Heart, Trash2, Plus } from "lucide-react";
import { useFavorites, useFavoriteStations } from "../lib/hooks/useFavorites";
import { RadioCard } from "../components/RadioCard";
import { Button } from "../components/ui/button";
import { useState } from "react";
import { NDKWFFavorites } from "../lib/NDKWFFavorites";
import { Input } from "@/components/ui/input";

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
    currentUser,
  } = useFavorites();


  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListDescription, setNewListDescription] = useState("");

  const favoriteCount = getFavoriteCount();
  const isLoading = favoritesLoading;

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;

    const newList = await createFavoritesList(newListName, newListDescription);
    if (newList) {
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
          <div className="bg-muted/50 p-6 rounded-lg">
            <h2 className="text-lg font-semibold mb-4">
              Create a New Favorites List
            </h2>
            <form onSubmit={handleCreateList} className="space-y-4">
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    List Name
                  </label>
                  <Input
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
                  <Input
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
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
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
                <Input
                  type="text"
                  placeholder="List name"
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

      {/* All Lists as Cards */}
      <div className="space-y-6">
        {favoritesLists.map((list) => (
          <FavoriteListCard
            key={list.favoritesId}
            list={list}
            isOwner={currentUser?.pubkey === list.pubkey}
          />
        ))}
      </div>
    </div>
  );
}

function FavoriteListCard({
  list,
  isOwner,
}: {
  list: NDKWFFavorites;
  isOwner: boolean;
}) {
  const { stations: listStations } = useFavoriteStations(list);
  const { removeFavorite } = useFavorites();

  const handleRemoveStation = async (station: any) => {
    if (isOwner) {
      await removeFavorite(station);
    }
  };

  // Generate a gradient based on list name for banner
  const getBannerGradient = (name: string) => {
    const colors = [
      "from-purple-500 to-pink-500",
      "from-blue-500 to-cyan-500",
      "from-green-500 to-emerald-500",
      "from-orange-500 to-red-500",
      "from-indigo-500 to-purple-500",
      "from-rose-500 to-pink-500",
    ];
    const hash = name.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      {/* Banner with Title and Description */}
      <div
        className={`bg-gradient-to-r ${list.banner ? "" : getBannerGradient(list.name || "")} p-6 text-white relative`}
        style={
          list.banner
            ? {
                backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.4)), url(${list.banner})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
      >
        <h2 className="text-2xl font-bold mb-2">{list.name}</h2>
        {list.description && (
          <p className="text-white/90 text-sm">{list.description}</p>
        )}
        <div className="mt-3 text-white/80 text-sm">
          {listStations.length} station{listStations.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Stations Grid */}
      <div className="p-4">
        {listStations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            This list is empty. Start adding stations!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {listStations.map((station) => (
              <div key={station.id} className="relative group">
                <RadioCard station={station} />
                {isOwner && (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-50"
                    onClick={() => handleRemoveStation(station)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
