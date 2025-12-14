import type { NDKFilter } from "@nostr-dev-kit/ndk";
import {
  useNDK,
  useNDKCurrentUser,
  useSubscribe,
  wrapEvent,
} from "@nostr-dev-kit/react";
import { useCallback, useMemo, useState } from "react";
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
  const [error, setError] = useState<string | null>(null);

  const filters = useMemo<NDKFilter[] | false>(() => {
    return currentUser?.pubkey
      ? [
          {
            kinds: [30078],
            authors: [currentUser?.pubkey],
            "#l": ["wavefunc_user_favourite_list"],
          },
        ]
      : false;
  }, [currentUser?.pubkey]);

  const { events, eose } = useSubscribe(filters);

  const favoritesLists = useMemo(() => {
    if (!currentUser?.pubkey) return [];
    return events.map((event) => wrapEvent(event) as NDKWFFavorites);
  }, [events, currentUser?.pubkey]);

  // Compute default list directly - no useState/useEffect needed!
  const defaultList = useMemo(() => {
    if (!currentUser?.pubkey) return null;

    if (favoritesLists.length > 0) {
      // Find "My Favorite Stations" or use first list
      return (
        favoritesLists.find((list) => list.name === "My Favorite Stations") ||
        favoritesLists[0] ||
        null
      );
    } else if (eose && ndk) {
      // No lists found after EOSE - create default
      const newFavorites = NDKWFFavorites.createDefault(ndk);
      newFavorites.pubkey = currentUser.pubkey;
      return newFavorites;
    }

    return null;
  }, [favoritesLists, eose, currentUser?.pubkey, ndk]);

  const loadFavorites = useCallback(async () => {}, []);

  const addFavorite = useCallback(
    async (station: NDKStation, listId?: string) => {
      if (!station.pubkey || !station.stationId) return false;

      const targetList = listId
        ? favoritesLists.find((list) => list.favoritesId === listId)
        : defaultList;

      if (!targetList) return false;

      try {
        const stationAddress = `31237:${station.pubkey}:${station.stationId}`;

        const added = await targetList.addStationAndPublish(stationAddress);

        return added;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add favorite");
        console.error("Failed to add favorite:", err);
        return false;
      }
    },
    [favoritesLists, defaultList]
  );

  const removeFavorite = useCallback(
    async (station: NDKStation) => {
      if (!station.pubkey || !station.stationId) return false;

      try {
        const stationAddress = `31237:${station.pubkey}:${station.stationId}`;
        let removed = false;

        for (const list of favoritesLists) {
          if (list.hasStation(stationAddress)) {
            await list.removeStationAndPublish(stationAddress);
            removed = true;
          }
        }

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

  const isFavorite = useCallback(
    (station: NDKStation) => {
      return isFavoriteInAnyList(station);
    },
    [favoritesLists]
  );

  const isFavoriteInAnyList = useCallback(
    (station: NDKStation) => {
      if (!station.pubkey || !station.stationId) return false;

      const stationAddress = `31237:${station.pubkey}:${station.stationId}`;
      return favoritesLists.some((list) => list.hasStation(stationAddress));
    },
    [favoritesLists]
  );

  const clearFavorites = useCallback(async () => {
    try {
      for (const list of favoritesLists) {
        await list.clearStationsAndPublish();
      }

      return true;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to clear favorites"
      );
      console.error("Failed to clear favorites:", err);
      return false;
    }
  }, [favoritesLists]);

  const getFavoriteCount = useCallback(() => {
    const allStations = new Set();
    favoritesLists.forEach((list) => {
      list.getStations().forEach((station) => allStations.add(station));
    });
    return allStations.size;
  }, [favoritesLists]);

  const createFavoritesList = useCallback(
    async (name: string, description?: string) => {
      if (!ndk || !currentUser?.pubkey) return null;

      const newList = NDKWFFavorites.createDefault(ndk, name, description);
      newList.pubkey = currentUser.pubkey;

      try {
        await newList.sign();
        await newList.publish();

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
    isLoading: !eose,
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
    "#l": ["wavefunc_user_favourite_list"],
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

  const { events: stations, eose } = useStations([filter]);

  return {
    stations,
    isLoading: !eose,
    error: null, // useStations doesn't expose errors, could be enhanced if needed
  };
}
