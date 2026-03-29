import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CreateFavoritesListForm } from "../components/CreateFavoritesListForm";
import { FavoriteListCard } from "../components/FavoriteListCard";
import { useFavorites } from "../lib/hooks/useFavorites";

export const Route = createFileRoute("/favorites")({
  component: Favorites,
});

function Favorites() {
  const {
    favoritesLists,
    getFavoriteCount,
    clearFavorites,
    createFavoritesList,
    isLoggedIn,
    currentUser,
  } = useFavorites();

  const [showCreateForm, setShowCreateForm] = useState(false);

  const favoriteCount = getFavoriteCount();

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
      await list.deleteList();
    } catch (error) {
      console.error("Failed to delete list:", error);
      alert("Failed to delete the list. Please try again.");
    }
  };

  // ── Not logged in ────────────────────────────────────────────────────────────

  if (!isLoggedIn) {
    return (
      <div className="space-y-6">
        <PageHeader favoriteCount={0} />
        <div className="border-4 border-on-background bg-surface-container-high shadow-[6px_6px_0px_0px_rgba(29,28,19,1)] p-12 text-center">
          <span className="material-symbols-outlined text-6xl text-on-background/20 block mb-4">lock</span>
          <div className="text-xl font-black uppercase tracking-tight mb-2 font-headline">
            AUTHENTICATION_REQUIRED
          </div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-on-background/50">
            CONNECT_TO_ACCESS_YOUR_FAVORITES
          </div>
        </div>
      </div>
    );
  }

  // ── Empty ────────────────────────────────────────────────────────────────────

  if (favoritesLists.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          favoriteCount={0}
          showCreateForm={showCreateForm}
          onNewList={() => setShowCreateForm(true)}
        />
        {showCreateForm ? (
          <div className="border-4 border-on-background bg-surface-container-high p-4 shadow-[6px_6px_0px_0px_rgba(29,28,19,1)]">
            <CreateFavoritesListForm
              onSubmit={handleCreateList}
              onCancel={() => setShowCreateForm(false)}
            />
          </div>
        ) : (
          <div className="border-4 border-on-background bg-surface-container-high shadow-[6px_6px_0px_0px_rgba(29,28,19,1)] p-12 text-center">
            <span className="material-symbols-outlined text-6xl text-on-background/20 block mb-4">queue_music</span>
            <div className="text-xl font-black uppercase tracking-tight mb-2 font-headline">
              NO_FAVORITES_YET
            </div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-on-background/50 mb-8">
              ADD_STATIONS_TO_BEGIN_BROADCASTING
            </div>
            <button
              onClick={() => setShowCreateForm(true)}
              className="bg-primary text-white px-6 py-3 font-black uppercase tracking-tight text-sm shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all flex items-center gap-2 mx-auto"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              CREATE_FIRST_LIST
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Main view ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        favoriteCount={favoriteCount}
        showCreateForm={showCreateForm}
        onNewList={() => setShowCreateForm(!showCreateForm)}
        onClearAll={favoriteCount > 0 ? clearFavorites : undefined}
      />

      {/* Create form */}
      {showCreateForm && (
        <div className="border-4 border-on-background bg-surface-container-high p-4 shadow-[6px_6px_0px_0px_rgba(29,28,19,1)]">
          <CreateFavoritesListForm
            onSubmit={handleCreateList}
            onCancel={() => setShowCreateForm(false)}
          />
        </div>
      )}

      {/* List grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

// ── Page header ───────────────────────────────────────────────────────────────

interface PageHeaderProps {
  favoriteCount: number;
  showCreateForm?: boolean;
  onNewList?: () => void;
  onClearAll?: () => void;
}

function PageHeader({ favoriteCount, showCreateForm, onNewList, onClearAll }: PageHeaderProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-4">
        <h1 className="text-2xl sm:text-4xl md:text-6xl font-black uppercase tracking-tighter font-headline">
          MY_FAVORITES
        </h1>
        <div className="h-2 flex-grow bg-on-background" />
        {favoriteCount > 0 && (
          <span className="font-bold text-primary text-sm hidden md:block tracking-widest uppercase">
            {favoriteCount}_STATIONS
          </span>
        )}
      </div>

      {(onNewList || onClearAll) && (
        <div className="flex items-center gap-2">
          {onNewList && (
            <button
              onClick={onNewList}
              className={`border-2 border-on-background px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-colors flex items-center gap-1.5 ${
                showCreateForm
                  ? "bg-on-background text-surface"
                  : "bg-surface hover:bg-on-background hover:text-surface"
              }`}
            >
              <span className="material-symbols-outlined text-[14px]">
                {showCreateForm ? "close" : "add"}
              </span>
              {showCreateForm ? "CANCEL" : "NEW_LIST"}
            </button>
          )}
          {onClearAll && (
            <button
              onClick={onClearAll}
              className="border-2 border-on-background/30 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-on-background/50 hover:border-red-500 hover:text-red-500 transition-colors flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[14px]">delete_sweep</span>
              CLEAR_ALL
            </button>
          )}
        </div>
      )}
    </div>
  );
}
