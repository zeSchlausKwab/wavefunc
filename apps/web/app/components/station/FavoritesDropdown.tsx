"use client";

import React, { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Heart, Plus, Trash2 } from "lucide-react";
import { FavoritesList } from "@wavefunc/common";
import { nostrService } from "@/services/ndk";
import {
  fetchFavoritesLists,
  subscribeToFavoritesLists,
  addStationToFavorites,
  updateFavoritesList,
} from "@wavefunc/common";
import { Station } from "@wavefunc/common";

interface FavoritesDropdownProps {
  station: Station;
  currentListId?: string; // If provided, the station is in this list
  favoritesLists: FavoritesList[]; // Add this prop
}

export function FavoritesDropdown({
  station,
  currentListId,
  favoritesLists: propFavoritesLists = [], // Rename to indicate it's from props
}: FavoritesDropdownProps) {
  const [selectedListId, setSelectedListId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [favoritesLists, setFavoritesLists] = useState<FavoritesList[]>([]);

  // Debug logs
  useEffect(() => {
    console.log("FavoritesDropdown state:", {
      stationId: station.id,
      currentListId,
      listsCount: favoritesLists.length,
      lists: favoritesLists.map((l) => ({ id: l.id, name: l.name })),
      selectedListId,
    });
  }, [station.id, currentListId, favoritesLists, selectedListId]);

  // Effect to handle NDK state and subscriptions
  useEffect(() => {
    const ndk = nostrService.getNDK();
    const pubkey = ndk?.activeUser?.pubkey;

    console.log("FavoritesDropdown NDK state:", {
      pubkey,
      hasNDK: !!ndk,
      hasSigner: !!ndk?.signer,
    });

    if (!pubkey || !ndk) {
      console.log("No pubkey or NDK, clearing state");
      setFavoritesLists([]);
      return;
    }

    setIsLoading(true);

    // Create a subscription first to ensure we don't miss any updates
    const subscription = subscribeToFavoritesLists(
      ndk,
      { pubkey },
      (favoritesList) => {
        console.log("Dropdown received list update:", {
          listId: favoritesList.id,
          listName: favoritesList.name,
          favorites: favoritesList.favorites.length,
        });

        setFavoritesLists((prev) => {
          // Check if we already have this list
          const index = prev.findIndex((list) => list.id === favoritesList.id);

          if (index >= 0) {
            // Update existing list
            const newLists = [...prev];
            newLists[index] = favoritesList;
            return newLists;
          }

          // Add new list
          return [...prev, favoritesList];
        });
      }
    );

    // Then do the initial fetch
    fetchFavoritesLists(ndk, { pubkey })
      .then((lists) => {
        console.log("Dropdown initial fetch results:", {
          pubkey,
          listsCount: lists.length,
          lists: lists.map((l) => ({ id: l.id, name: l.name })),
        });
        setFavoritesLists(lists);
      })
      .catch((error) => {
        console.error("Error fetching favorites lists:", error);
      })
      .finally(() => {
        setIsLoading(false);
      });

    // Cleanup function
    return () => {
      console.log("Cleaning up dropdown subscription");
      subscription?.stop();
      setFavoritesLists([]);
    };
  }, [nostrService.getNDK()?.activeUser?.pubkey]); // Depend on pubkey changes

  // Set initial selected list when lists are available
  useEffect(() => {
    if (favoritesLists.length > 0) {
      // If we have a current list, use that
      if (currentListId) {
        setSelectedListId(currentListId);
      } else {
        // Otherwise use the first list
        setSelectedListId(favoritesLists[0].id);
      }
    }
  }, [favoritesLists, currentListId]);

  const handleAddToFavorites = async () => {
    if (!selectedListId) return;

    try {
      const ndk = nostrService.getNDK();
      if (!ndk?.activeUser?.pubkey) {
        console.log("No user logged in");
        return;
      }

      const selectedList = favoritesLists.find(
        (list) => list.id === selectedListId
      );
      if (!selectedList) return;

      await addStationToFavorites(ndk, selectedList, {
        id: station.id,
        name: station.name,
        naddr: station.naddr,
      });
    } catch (error) {
      console.error("Error adding station to favorites:", error);
    }
  };

  const handleRemoveFromFavorites = async () => {
    if (!currentListId) return;

    try {
      const ndk = nostrService.getNDK();
      if (!ndk?.activeUser?.pubkey) {
        console.log("No user logged in");
        return;
      }

      const currentList = favoritesLists.find(
        (list) => list.id === currentListId
      );
      if (!currentList) return;

      // Remove the station from the favorites array
      const updatedFavorites = currentList.favorites.filter(
        (f) => f.event_id !== station.id
      );

      // Update the list
      await updateFavoritesList(ndk, currentList, {
        name: currentList.name,
        description: currentList.description,
        favorites: updatedFavorites,
      });
    } catch (error) {
      console.error("Error removing station from favorites:", error);
    }
  };

  // If we have a currentListId, show the remove button
  if (currentListId) {
    return (
      <div className="flex items-center space-x-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRemoveFromFavorites}
          title="Remove from list"
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  // Check if user is logged in
  const ndk = nostrService.getNDK();
  if (!ndk?.activeUser?.pubkey) {
    return (
      <div className="flex items-center space-x-2">
        <Select disabled>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Login to add to favorites" />
          </SelectTrigger>
        </Select>
        <Button variant="ghost" size="icon" disabled>
          <Plus className="h-4 w-4 text-primary" />
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center space-x-2">
        <Select disabled>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Loading lists..." />
          </SelectTrigger>
        </Select>
        <Button variant="ghost" size="icon" disabled>
          <Plus className="h-4 w-4 text-primary" />
        </Button>
      </div>
    );
  }

  // If no lists available, show disabled state
  if (!Array.isArray(favoritesLists) || favoritesLists.length === 0) {
    return (
      <div className="flex items-center space-x-2">
        <Select disabled>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="No lists available" />
          </SelectTrigger>
        </Select>
        <Button variant="ghost" size="icon" disabled>
          <Plus className="h-4 w-4 text-primary" />
        </Button>
      </div>
    );
  }

  // Otherwise show the add to list dropdown
  return (
    <div className="flex items-center space-x-2">
      <Select
        value={selectedListId || undefined}
        onValueChange={setSelectedListId}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Select a list">
            {selectedListId ?
              favoritesLists.find((list) => list.id === selectedListId)?.name
            : "Select a list"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {favoritesLists.map((list) => (
            <SelectItem key={list.id} value={list.id}>
              {list.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleAddToFavorites}
        disabled={!selectedListId}
        title="Add to selected list"
      >
        <Plus className="h-4 w-4 text-primary" />
      </Button>
    </div>
  );
}
