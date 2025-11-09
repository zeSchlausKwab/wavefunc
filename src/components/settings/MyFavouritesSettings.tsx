import { useFavorites } from "@/lib/hooks/useFavorites";
import { FavoriteListCard } from "../FavoriteListCard";
import { CreateFavoritesListForm } from "../CreateFavoritesListForm";
import { Button } from "../ui/button";
import { Plus, Trash2 } from "lucide-react";
import { StarIcon } from "../ui/icons/lucide-star";
import { useState } from "react";
import { useNDKCurrentUser } from "@nostr-dev-kit/react";
import { useMedia } from "react-use";

export function MyFavouritesSettings() {
  const currentUser = useNDKCurrentUser();
  const {
    favoritesLists,
    getFavoriteCount,
    clearFavorites,
    createFavoritesList,
    isLoading,
  } = useFavorites();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const isMobile = useMedia("(max-width: 768px)");

  const favoriteCount = getFavoriteCount();

  if (!currentUser) {
    return (
      <div className="text-muted-foreground">
        Please log in to manage your favorites.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="text-muted-foreground">Loading your favorites...</div>
    );
  }

  const handleCreateList = async (
    name: string,
    description: string,
    banner?: string
  ) => {
    const newList = await createFavoritesList(name, description);
    if (newList && banner) {
      newList.banner = banner;
      await newList.sign();
      await newList.publish();
    }
    setShowCreateForm(false);
  };

  const handleDeleteList = async (listId: string) => {
    if (
      !confirm(
        "Are you sure you want to delete this favorites list? This action cannot be undone."
      )
    ) {
      return;
    }

    const list = favoritesLists.find((l) => l.favoritesId === listId);
    if (!list) return;

    try {
      // Delete the list (publishes kind 5 deletion event)
      await list.deleteList();
      console.log("List deleted successfully");
    } catch (error) {
      console.error("Failed to delete list:", error);
      alert("Failed to delete the list. Please try again.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StarIcon className="w-5 h-5 text-yellow-500" fill="currentColor" />
            <h3 className="text-lg font-semibold">My Favourites</h3>
            {favoriteCount > 0 && (
              <span className="bg-muted text-muted-foreground px-2 py-1 rounded-full text-sm">
                {favoriteCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!showCreateForm && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCreateForm(true)}
              >
                <Plus className="w-4 h-4 mr-2" />
                {!isMobile && "New List"}
              </Button>
            )}
            {favoriteCount > 0 && (
              <Button variant="outline" size="sm" onClick={clearFavorites}>
                <Trash2 className="w-4 h-4 mr-2" />
                {!isMobile && "Clear All"}
              </Button>
            )}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Organize your favorite stations into lists.
        </p>
      </div>

      {showCreateForm && (
        <CreateFavoritesListForm
          onSubmit={handleCreateList}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {favoritesLists.length === 0 && !showCreateForm ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center space-y-4">
          <StarIcon className="w-12 h-12 mx-auto text-muted-foreground/50" />
          <div className="space-y-2">
            <h4 className="font-semibold">No favorite lists yet</h4>
            <p className="text-sm text-muted-foreground">
              Create a list to start organizing your favorite stations.
            </p>
          </div>
          <Button onClick={() => setShowCreateForm(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Your First List
          </Button>
        </div>
      ) : (
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
      )}
    </div>
  );
}
