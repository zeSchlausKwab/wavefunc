import { createFileRoute } from "@tanstack/react-router";
import { Heart, Trash2, Plus } from "lucide-react";
import { useFavorites } from "../lib/hooks/useFavorites";
import { Button } from "../components/ui/button";
import { useState } from "react";
import { FavoriteListCard } from "../components/FavoriteListCard";
import { CreateFavoritesListForm } from "../components/CreateFavoritesListForm";

export const Route = createFileRoute("/favorites")({
  component: Favorites,
});

function Favorites() {
  const {
    favoritesLists,
    getFavoriteCount,
    clearFavorites,
    createFavoritesList,
    isLoading: favoritesLoading,
    isLoggedIn,
    currentUser,
  } = useFavorites();

  const [showCreateForm, setShowCreateForm] = useState(false);

  const favoriteCount = getFavoriteCount();
  const isLoading = favoritesLoading;

  const handleCreateList = async (name: string, description: string, banner?: string) => {
    const newList = await createFavoritesList(name, description);
    if (newList && banner) {
      // Set the banner after creation
      newList.banner = banner;
      await newList.sign();
      await newList.publish();
    }
    setShowCreateForm(false);
  };

  const handleDeleteList = async (listId: string) => {
    if (!confirm("Are you sure you want to delete this favorites list? This action cannot be undone.")) {
      return;
    }

    const list = favoritesLists.find((l) => l.favoritesId === listId);
    if (!list) return;

    // Delete the list by publishing a deletion event (kind 5)
    try {
      // Clear all stations first
      await list.clearStationsAndPublish();

      // Note: In Nostr, we typically delete by publishing a kind 5 deletion event
      // For now, we'll just clear the list. Full deletion would require implementing NIP-09
      console.log("List cleared successfully");
    } catch (error) {
      console.error("Failed to delete list:", error);
      alert("Failed to delete the list. Please try again.");
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
          <div className="max-w-2xl mx-auto">
            <CreateFavoritesListForm
              onSubmit={handleCreateList}
              onCancel={() => setShowCreateForm(false)}
            />
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
          <CreateFavoritesListForm
            onSubmit={handleCreateList}
            onCancel={() => setShowCreateForm(false)}
          />
        )}
      </div>

      {/* All Lists as Cards */}
      <div className="space-y-6">
        {favoritesLists.map((list) => (
          <FavoriteListCard
            key={list.favoritesId}
            list={list}
            isOwner={currentUser?.pubkey === list.pubkey}
            onDeleteList={() => handleDeleteList(list.favoritesId!)}
          />
        ))}
      </div>
    </div>
  );
}
