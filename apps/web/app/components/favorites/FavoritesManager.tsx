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
  Station,
  parseRadioEvent,
} from "@wavefunc/common";
import { Edit, Heart, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { EditFavoritesListDrawer } from "./EditFavoritesListDrawer";
import { ExpandableStationCard } from "../station/ExpandableStationCard";
import { NDKEvent } from "@nostr-dev-kit/ndk";

interface ResolvedStation {
  id: string;
  station: Station | null;
  favorite: {
    event_id: string;
    name: string;
    added_at: number;
    naddr?: string;
  };
}

export function FavoritesManager() {
  const [favoritesLists, setFavoritesLists] = useState<FavoritesList[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedFavoritesList, setSelectedFavoritesList] = useState<
    FavoritesList | undefined
  >();
  const [isLoading, setIsLoading] = useState(true);
  const [resolvedStations, setResolvedStations] = useState<
    Record<string, ResolvedStation>
  >({});

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

  // Effect to resolve stations when favorites lists change
  useEffect(() => {
    const resolveStations = async () => {
      const ndk = nostrService.getNDK();
      if (!ndk) return;

      const newResolvedStations: Record<string, ResolvedStation> = {};

      for (const list of favoritesLists) {
        for (const favorite of list.favorites) {
          if (newResolvedStations[favorite.event_id]) continue;

          try {
            let event: NDKEvent | null = null;

            if (favorite.naddr) {
              // Try to fetch by naddr first
              event = await ndk.fetchEvent(favorite.naddr);
            } else {
              // Fallback to event_id
              event = await ndk.fetchEvent(favorite.event_id);
            }

            if (event) {
              const parsedStation = parseRadioEvent(event);
              const station: Station = {
                ...parsedStation,
                id: favorite.event_id,
                genre:
                  parsedStation.tags.find((t) => t[0] === "genre")?.[1] || "",
                imageUrl:
                  parsedStation.tags.find((t) => t[0] === "thumbnail")?.[1] ||
                  "",
                pubkey: event.pubkey,
                created_at: favorite.added_at,
              };

              console.log("Resolved station:", station);

              newResolvedStations[favorite.event_id] = {
                id: favorite.event_id,
                station,
                favorite,
              };
            }
          } catch (error) {
            console.error(
              `Error resolving station ${favorite.event_id}:`,
              error
            );
            // Add a placeholder for failed resolutions
            newResolvedStations[favorite.event_id] = {
              id: favorite.event_id,
              station: null,
              favorite,
            };
          }
        }
      }

      setResolvedStations(newResolvedStations);
    };

    resolveStations();
  }, [favoritesLists]);

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
      : <div className="space-y-4">
          {favoritesLists.map((list) => (
            <Card key={list.id} className="w-full">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="text-lg font-semibold">
                      {list.name}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {list.description || "No description"}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEditList(list)}
                  >
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {list.favorites.map((favorite) => {
                    const resolved = resolvedStations[favorite.event_id];
                    if (!resolved) {
                      return (
                        <div
                          key={favorite.event_id}
                          className="text-center py-4 text-muted-foreground"
                        >
                          Loading station...
                        </div>
                      );
                    }
                    if (!resolved.station) {
                      return (
                        <div
                          key={favorite.event_id}
                          className="text-center py-4 text-destructive"
                        >
                          Failed to load station: {favorite.name}
                        </div>
                      );
                    }
                    return (
                      <ExpandableStationCard
                        key={favorite.event_id}
                        station={resolved.station}
                        currentListId={list.id}
                      />
                    );
                  })}
                  {list.favorites.length === 0 && (
                    <div className="text-center py-4 text-muted-foreground">
                      No stations in this list yet
                    </div>
                  )}
                </div>
              </CardContent>
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
