import type { NDKFilter } from "@nostr-dev-kit/ndk";
import {
  useNDK,
  useNDKCurrentUser,
  useSubscribe,
  wrapEvent,
} from "@nostr-dev-kit/react";
import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import NDKStation from "../NDKStation";
import { NDKWFFavorites } from "../NDKWFFavorites";
import { useStations } from "./useStations";

// Extend window for debug throttling
declare global {
  interface Window {
    lastLoggedEvent?: string;
  }
}

/**
 * A hook for managing user favorites lists with Nostr integration.
 * Provides methods to load, create, and manage multiple favorites lists.
 * Automatically uses the current logged-in user from NDK.
 */
export function useFavorites() {
  const { ndk } = useNDK();
  const currentUser = useNDKCurrentUser();
  const [favoritesLists, setFavoritesLists] = useState<NDKWFFavorites[]>([]);
  const [defaultList, setDefaultList] = useState<NDKWFFavorites | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const subscriptionRef = useRef<any>(null);

  // Load user's favorites lists from Nostr
  const loadFavorites = useCallback(async () => {
    if (!ndk || !currentUser?.pubkey) return;

    setIsLoading(true);
    setError(null);

    try {
      const filter: NDKFilter = {
        kinds: [30078],
        authors: [currentUser.pubkey],
        "#l": ["wavefunc_user_favourite_list"],
      };

      const events = await ndk.fetchEvents(filter, { groupable: false });
      const favoritesEvents = Array.from(events).map((event) =>
        NDKWFFavorites.from(event)
      );

      setFavoritesLists(favoritesEvents);

      // Set default list (first one or create new one)
      if (favoritesEvents.length > 0) {
        const firstList =
          favoritesEvents.find(
            (list) => list.name === "My Favorite Stations"
          ) || favoritesEvents[0];
        if (firstList) {
          setDefaultList(firstList);
        }
      } else {
        // Create a new default favorites list if none exists
        const newFavorites = NDKWFFavorites.createDefault(ndk);
        newFavorites.pubkey = currentUser.pubkey;
        setDefaultList(newFavorites);
        setFavoritesLists([newFavorites]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load favorites");
      console.error("Failed to load favorites:", err);
    } finally {
      setIsLoading(false);
    }
  }, [ndk, currentUser?.pubkey]);

  // Load favorites on mount
  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  // Subscribe to favorites updates in real-time
  useEffect(() => {
    if (!ndk || !currentUser?.pubkey) {
      return;
    }

    // Set up subscription for real-time updates
    const filter: NDKFilter = {
      kinds: [30078],
      authors: [currentUser.pubkey],
      "#l": ["wavefunc_user_favourite_list"],
    };

    const sub = ndk.subscribe(filter, { closeOnEose: false });

    sub.on("event", (event) => {
      const updatedFavorites = NDKWFFavorites.from(event);

      setFavoritesLists((prevLists) => {
        // Find if this favorites list already exists
        const existingIndex = prevLists.findIndex(
          (list) => list.favoritesId === updatedFavorites.favoritesId
        );

        if (existingIndex !== -1) {
          // Update existing list
          const newLists = [...prevLists];
          newLists[existingIndex] = updatedFavorites;
          return newLists;
        } else {
          // Add new list
          return [...prevLists, updatedFavorites];
        }
      });

      // Update default list separately if needed
      setDefaultList((prevDefault) => {
        if (prevDefault?.favoritesId === updatedFavorites.favoritesId) {
          return updatedFavorites;
        }
        return prevDefault;
      });
    });

    subscriptionRef.current = sub;

    return () => {
      sub?.stop();
    };
  }, [ndk, currentUser?.pubkey]);

  // Add a station to a specific favorites list
  const addFavorite = useCallback(
    async (station: NDKStation, listId?: string) => {
      if (!station.pubkey || !station.stationId) return false;

      // Use provided list or default list
      const targetList = listId
        ? favoritesLists.find((list) => list.favoritesId === listId)
        : defaultList;

      if (!targetList) return false;

      try {
        const stationAddress = `31237:${station.pubkey}:${station.stationId}`;

        // Use the class method to add and publish
        const added = await targetList.addStationAndPublish(stationAddress);

        // No local state manipulation - let the relay subscription handle updates

        return added;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add favorite");
        console.error("Failed to add favorite:", err);
        return false;
      }
    },
    [favoritesLists, defaultList]
  );

  // Remove a station from favorites (searches all lists)
  const removeFavorite = useCallback(
    async (station: NDKStation) => {
      if (!station.pubkey || !station.stationId) return false;

      try {
        const stationAddress = `31237:${station.pubkey}:${station.stationId}`;
        let removed = false;

        // Find and remove from all lists that contain this station
        for (const list of favoritesLists) {
          if (list.hasStation(stationAddress)) {
            // Use the class method to remove and publish
            await list.removeStationAndPublish(stationAddress);
            removed = true;
          }
        }

        // No local state manipulation - let the relay subscription handle updates

        return removed;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to remove favorite"
        );
        console.error("Failed to remove favorite:", err);
        return false;
      }
    },
    [favoritesLists]
  );

  // Toggle a station in favorites (uses default list for adding)
  const toggleFavorite = useCallback(
    async (station: NDKStation, listId?: string) => {
      if (!station.pubkey || !station.stationId) return false;

      const isCurrentlyFavorite = isFavoriteInAnyList(station);

      if (isCurrentlyFavorite) {
        return await removeFavorite(station);
      } else {
        return await addFavorite(station, listId);
      }
    },
    [addFavorite, removeFavorite]
  );

  // Check if a station is in any favorites list
  const isFavorite = useCallback(
    (station: NDKStation) => {
      return isFavoriteInAnyList(station);
    },
    [favoritesLists]
  );

  // Helper function to check if station is in any list
  const isFavoriteInAnyList = useCallback(
    (station: NDKStation) => {
      if (!station.pubkey || !station.stationId) return false;

      const stationAddress = `31237:${station.pubkey}:${station.stationId}`;
      return favoritesLists.some((list) => list.hasStation(stationAddress));
    },
    [favoritesLists]
  );

  // Clear all favorites from all lists
  const clearFavorites = useCallback(async () => {
    try {
      for (const list of favoritesLists) {
        // Use the class method to clear and publish
        await list.clearStationsAndPublish();
      }

      // No local state manipulation - let the relay subscription handle updates
      return true;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to clear favorites"
      );
      console.error("Failed to clear favorites:", err);
      return false;
    }
  }, [favoritesLists]);

  // Get the total count of favorites across all lists
  const getFavoriteCount = useCallback(() => {
    const allStations = new Set();
    favoritesLists.forEach((list) => {
      list.getStations().forEach((station) => allStations.add(station));
    });
    return allStations.size;
  }, [favoritesLists]);

  // Create a new favorites list
  const createFavoritesList = useCallback(
    async (name: string, description?: string) => {
      if (!ndk || !currentUser?.pubkey) return null;

      const newList = NDKWFFavorites.createDefault(ndk, name, description);
      newList.pubkey = currentUser.pubkey;

      try {
        await newList.sign();
        await newList.publish();

        // No local state manipulation - let the relay subscription handle updates

        return newList;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to create favorites list"
        );
        console.error("Failed to create favorites list:", err);
        return null;
      }
    },
    [ndk, currentUser, favoritesLists, defaultList]
  );

  // Check if user is logged in
  const isLoggedIn = !!currentUser?.pubkey;

  return {
    // State
    favoritesLists,
    defaultList,
    isLoading,
    error,
    isLoggedIn,
    currentUser,

    // Backwards compatibility
    favoritesList: defaultList,

    // Actions
    addFavorite,
    removeFavorite,
    toggleFavorite,
    isFavorite,
    clearFavorites,
    loadFavorites,
    createFavoritesList,

    // Utils
    getFavoriteCount,
    isFavoriteInAnyList,
  };
}

/**
 * A hook for subscribing to all favorites lists (for discovery/browsing).
 * Similar to useStations but for favorites lists.
 */
export function useFavoritesLists(
  additionalFilters: Omit<NDKFilter, "kinds">[] = [{}]
) {
  const filters = additionalFilters.map((filter) => ({
    ...filter,
    kinds: NDKWFFavorites.kinds,
    "#l": ["wavefunc_user_favourite_list"], // Only user favorites, not featured lists
  }));

  const { events, eose } = useSubscribe(filters);
  const favoritesLists = events.map(
    (event) => wrapEvent(event) as NDKWFFavorites
  );

  return {
    events: favoritesLists,
    eose,
  };
}

/**
 * A hook for getting favorite stations as actual NDKStation objects.
 * This resolves the station addresses in a favorites list to actual station events.
 *
 * Reuses the proven useStations hook for consistency and reliability.
 */
export function useFavoriteStations(favoritesList: NDKWFFavorites | null) {
  const stationAddresses = favoritesList?.getStations() || [];

  // Build filter from station addresses
  const filter = useMemo<Omit<NDKFilter, "kinds">>(() => {
    if (stationAddresses.length === 0) {
      // Return empty filter that will match nothing
      return { authors: [] };
    }

    // Parse addresses to extract authors and d-tags
    const authors = Array.from(
      new Set(
        stationAddresses
          .map((addr) => addr.split(":")[1])
          .filter((p): p is string => Boolean(p))
      )
    );
    const dTags = Array.from(
      new Set(
        stationAddresses
          .map((addr) => addr.split(":")[2])
          .filter((d): d is string => Boolean(d))
      )
    );

    return {
      authors,
      "#d": dTags,
    };
  }, [JSON.stringify(stationAddresses)]);

  // Reuse the proven useStations hook
  const { events: stations, eose } = useStations([filter]);

  return {
    stations,
    isLoading: !eose,
    error: null, // useStations doesn't expose errors, could be enhanced if needed
  };
}
