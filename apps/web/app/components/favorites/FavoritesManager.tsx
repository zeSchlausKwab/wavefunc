"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { nostrService } from "@/services/ndk";
import {
  FavoritesList,
  fetchFavoritesLists,
  subscribeToFavoritesLists,
} from "@wavefunc/common";
import { Edit, Heart, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { EditFavoritesListDrawer } from "./EditFavoritesListDrawer";

export function FavoritesManager() {
  const [favoritesLists, setFavoritesLists] = useState<FavoritesList[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedFavoritesList, setSelectedFavoritesList] = useState<
    FavoritesList | undefined
  >();
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

  const handleCreateNewList = () => {
    setSelectedFavoritesList(undefined);
    setIsDrawerOpen(true);
  };

  const handleEditList = (list: FavoritesList) => {
    setSelectedFavoritesList(list);
    setIsDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setSelectedFavoritesList(undefined);
  };

  return (
    <div className="my-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold font-press-start-2p text-primary">
          My Favorites Lists
        </h2>
        <Button onClick={handleCreateNewList} className="bg-primary text-white">
          <Plus className="mr-2 h-4 w-4" />
          New List
        </Button>
      </div>

      {isLoading ?
        <div className="text-center py-8">Loading favorites lists...</div>
      : favoritesLists.length === 0 ?
        <Card className="border-dashed border-2 border-muted-foreground bg-muted/20">
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <Heart className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg mb-2">
              No Favorites Lists Yet
            </h3>
            <p className="text-muted-foreground mb-4">
              Create your first favorites list to organize your favorite radio
              stations
            </p>
            <Button onClick={handleCreateNewList}>
              <Plus className="mr-2 h-4 w-4" />
              Create Your First List
            </Button>
          </CardContent>
        </Card>
      : <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {favoritesLists.map((list) => (
            <Card key={list.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle className="text-md font-semibold">
                  {list.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-2">
                  {list.description || "No description"}
                </p>
                <p className="text-sm font-medium">
                  {list.favorites.length}{" "}
                  {list.favorites.length === 1 ? "station" : "stations"}
                </p>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleEditList(list)}
                >
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      }

      {/* Drawer for creating/editing favorites lists */}
      <EditFavoritesListDrawer
        favoritesList={selectedFavoritesList}
        isOpen={isDrawerOpen}
        onClose={handleCloseDrawer}
      />
    </div>
  );
}
