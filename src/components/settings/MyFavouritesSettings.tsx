import { useFavorites } from "@/lib/hooks/useFavorites";
import { FavoriteListCard } from "../FavoriteListCard";
import { CreateFavoritesListForm } from "../CreateFavoritesListForm";
import { useState } from "react";
import { useMedia } from "react-use";
import { useCurrentAccount } from "@/lib/nostr/auth";

export function MyFavouritesSettings() {
  const currentUser = useCurrentAccount();
  const {
    favoritesLists,
    getFavoriteCount,
    clearFavorites,
    createFavoritesList,
    deleteFavoritesList,
    isLoading,
  } = useFavorites();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const isMobile = useMedia("(max-width: 768px)");

  const favoriteCount = getFavoriteCount();

  if (!currentUser) {
    return (
      <p className="text-sm text-on-background/60">Please log in to manage your favorites.</p>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-on-background/60">
        <span className="material-symbols-outlined text-[18px] animate-spin">sync</span>
        <span className="text-sm">Loading your favorites...</span>
      </div>
    );
  }

  const handleCreateList = async (
    name: string,
    description: string,
    image?: string,
    banner?: string
  ) => {
    await createFavoritesList(name, description, image, banner);
    setShowCreateForm(false);
  };

  const handleDeleteList = async (listId: string) => {
    if (!confirm("Are you sure you want to delete this favorites list? This action cannot be undone.")) {
      return;
    }
    try {
      await deleteFavoritesList(listId);
    } catch (error) {
      console.error("Failed to delete list:", error);
      alert("Failed to delete the list. Please try again.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div className="flex items-center justify-between pb-3 border-b-4 border-on-background">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px]">star</span>
          <h3 className="text-base font-black uppercase tracking-tighter">My Favourites</h3>
          {favoriteCount > 0 && (
            <span className="border-2 border-on-background/40 bg-surface-container-low px-2 py-0.5 text-[10px] font-black">
              {favoriteCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!showCreateForm && (
            <button
              onClick={() => setShowCreateForm(true)}
              className="flex items-center gap-1.5 border-4 border-on-background shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] px-3 py-2 text-[11px] font-black uppercase tracking-widest bg-primary text-white hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all"
            >
              <span className="material-symbols-outlined text-[15px]">add</span>
              {!isMobile && "New List"}
            </button>
          )}
          {favoriteCount > 0 && (
            <button
              onClick={clearFavorites}
              className="flex items-center gap-1.5 border-4 border-on-background shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] px-3 py-2 text-[11px] font-black uppercase tracking-widest hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all"
            >
              <span className="material-symbols-outlined text-[15px]">delete</span>
              {!isMobile && "Clear All"}
            </button>
          )}
        </div>
      </div>

      <p className="text-sm text-on-background/60">
        Organize your favorite stations into lists.
      </p>

      {showCreateForm && (
        <CreateFavoritesListForm
          onSubmit={handleCreateList}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {favoritesLists.length === 0 && !showCreateForm ? (
        <div className="border-4 border-dashed border-on-background/30 p-12 text-center space-y-4">
          <span className="material-symbols-outlined text-[48px] text-on-background/20">star</span>
          <div className="space-y-1">
            <h4 className="text-sm font-black uppercase tracking-tighter">No favorite lists yet</h4>
            <p className="text-sm text-on-background/60">
              Create a list to start organizing your favorite stations.
            </p>
          </div>
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center gap-1.5 mx-auto border-4 border-on-background shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] px-4 py-2 text-[11px] font-black uppercase tracking-widest bg-primary text-white hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            Create Your First List
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {favoritesLists.map((list) => (
            <FavoriteListCard
              key={list.favoritesId}
              list={list}
              isOwner={currentUser?.pubkey === list.event.pubkey}
              onDeleteList={() => handleDeleteList(list.favoritesId!)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
