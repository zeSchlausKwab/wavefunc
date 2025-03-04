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
import { Heart, Plus } from "lucide-react";
import { FavoritesList } from "@wavefunc/common";
import { nostrService } from "@/services/ndk";
import {
  fetchFavoritesLists,
  subscribeToFavoritesLists,
  addStationToFavorites,
} from "@wavefunc/common";
import { Station } from "@wavefunc/common";

interface FavoritesDropdownProps {
  station: Station;
}

export function FavoritesDropdown({ station }: FavoritesDropdownProps) {
  const [favoritesLists, setFavoritesLists] = useState<FavoritesList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string>("loading");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let subscription: ReturnType<typeof subscribeToFavoritesLists>;

    const fetchData = async () => {
      try {
        const ndk = nostrService.getNDK();
        if (!ndk) return;

        // Initial fetch
        const lists = await fetchFavoritesLists(ndk, {
          pubkey: ndk.activeUser?.pubkey,
        });
        setFavoritesLists(lists);

        // Subscribe to updates
        subscription = subscribeToFavoritesLists(
          ndk,
          { pubkey: ndk.activeUser?.pubkey },
          (favoritesList) => {
            setFavoritesLists((prev) => {
              // Replace if exists, otherwise add
              const index = prev.findIndex(
                (list) => list.id === favoritesList.id
              );
              if (index >= 0) {
                const newLists = [...prev];
                newLists[index] = favoritesList;
                return newLists;
              }
              return [...prev, favoritesList];
            });
          }
        );
      } catch (error) {
        console.error("Error fetching favorites lists:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();

    return () => {
      if (subscription) {
        subscription.stop();
      }
    };
  }, []);

  const handleAddToFavorites = async () => {
    if (!selectedListId) return;

    try {
      const ndk = nostrService.getNDK();
      if (!ndk) return;

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

  if (isLoading) {
    return (
      <div className="flex items-center space-x-2">
        <Select disabled>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Loading lists..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="loading">Loading...</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" disabled>
          <Heart className="h-4 w-4 text-primary" />
        </Button>
      </div>
    );
  }

  if (favoritesLists.length === 0) {
    return (
      <div className="flex items-center space-x-2">
        <Select disabled>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="No lists available" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="no-lists">No lists available</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" disabled>
          <Heart className="h-4 w-4 text-primary" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-2">
      <Select value={selectedListId} onValueChange={setSelectedListId}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Select a list" />
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
        disabled={selectedListId === "loading" || selectedListId === "no-lists"}
        title="Add to selected list"
      >
        <Heart className="h-4 w-4 text-primary" />
      </Button>
    </div>
  );
}
