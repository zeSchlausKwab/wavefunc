import { TimelineModel } from "applesauce-core/models";
import type { Filter } from "applesauce-core/helpers/filter";
import { useEventModel } from "applesauce-react/hooks";
import { storeEvents } from "applesauce-relay/operators";
import { useCallback, useEffect, useMemo, useState } from "react";
import { addressesToParameterizedFilters, getAppDataRelayUrls } from "../../config/nostr";
import { useCurrentAccount } from "../nostr/auth";
import {
  buildFavoritesListAddStationTemplate,
  buildFavoritesListDeletionTemplate,
  buildFavoritesListRemoveStationTemplate,
  buildFavoritesListTemplate,
  buildFavoritesListUpdateTemplate,
  hasFavoriteStation,
  parseFavoritesListEvent,
  parseStationEvent,
  STATION_KIND,
  type ParsedFavoritesList,
} from "../nostr/domain";
import { useWavefuncNostr } from "../nostr/runtime";

type StationLike = {
  pubkey?: string | null;
  stationId?: string | null;
};

const DEFAULT_FAVORITES_LIST_FILTERS: Omit<Filter, "kinds">[] = [{}];

function getStationAddress(station: StationLike) {
  if (!station.pubkey || !station.stationId) {
    return null;
  }

  return `${STATION_KIND}:${station.pubkey}:${station.stationId}`;
}

function useFavoritesListStream(filters: Filter[] | false) {
  const { eventStore, relayPool } = useWavefuncNostr();

  const [eose, setEose] = useState(false);
  useEffect(() => {
    if (!filters || filters.length === 0) {
      setEose(true);
      return;
    }
    setEose(false);
    const subscription = relayPool
      .subscription(getAppDataRelayUrls(), filters)
      .pipe(storeEvents(eventStore))
      .subscribe({
        next: (message) => {
          if (message === "EOSE") setEose(true);
        },
      });
    return () => subscription.unsubscribe();
  }, [eventStore, relayPool, filters]);

  const rawEvents =
    useEventModel(
      TimelineModel,
      filters && filters.length > 0 ? [filters] : null,
    ) ?? [];

  const events = useMemo(
    () => rawEvents.map((event) => parseFavoritesListEvent(event)),
    [rawEvents],
  );

  return { events, eose };
}

export function useFavorites() {
  const currentAccount = useCurrentAccount();
  const { signAndPublish } = useWavefuncNostr();
  const [error, setError] = useState<string | null>(null);

  const filters = useMemo<Filter[] | false>(() => {
    if (!currentAccount?.pubkey) {
      return false;
    }

    return [
      {
        kinds: [30078],
        authors: [currentAccount.pubkey],
        "#l": ["wavefunc_user_favourite_list"],
      },
    ];
  }, [currentAccount?.pubkey]);

  const { events: favoritesLists, eose } = useFavoritesListStream(filters);

  const defaultList = useMemo(() => {
    return (
      favoritesLists.find((list) => list.name === "My Favorite Stations") ??
      favoritesLists[0] ??
      null
    );
  }, [favoritesLists]);

  const createFavoritesList = useCallback(
    async (
      name: string,
      description?: string,
      image?: string,
      banner?: string
    ) => {
      if (!currentAccount?.pubkey) {
        return null;
      }

      try {
        const event = await signAndPublish(
          buildFavoritesListTemplate({ name, description, image, banner }),
          getAppDataRelayUrls()
        );

        return parseFavoritesListEvent(event, getAppDataRelayUrls());
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to create favorites list"
        );
        console.error("Failed to create favorites list:", err);
        return null;
      }
    },
    [currentAccount?.pubkey, signAndPublish]
  );

  const updateFavoritesList = useCallback(
    async (
      listId: string,
      input: {
        name?: string;
        description?: string;
        image?: string;
        banner?: string;
      }
    ) => {
      const list = favoritesLists.find((entry) => entry.favoritesId === listId);
      if (!list) {
        return null;
      }

      try {
        const event = await signAndPublish(
          buildFavoritesListUpdateTemplate(list.event, {
            name: input.name,
            description: input.description,
            image: input.image,
            banner: input.banner,
          }),
          getAppDataRelayUrls()
        );

        return parseFavoritesListEvent(event, getAppDataRelayUrls());
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to update favorites list"
        );
        console.error("Failed to update favorites list:", err);
        return null;
      }
    },
    [favoritesLists, signAndPublish]
  );

  const addFavorite = useCallback(
    async (station: StationLike, listId?: string) => {
      const stationAddress = getStationAddress(station);
      if (!stationAddress) {
        return false;
      }

      let targetList =
        (listId
          ? favoritesLists.find((list) => list.favoritesId === listId)
          : defaultList) ?? null;

      if (!targetList) {
        targetList = await createFavoritesList("My Favorite Stations");
      }

      if (!targetList || hasFavoriteStation(targetList, stationAddress)) {
        return false;
      }

      try {
        await signAndPublish(
          buildFavoritesListAddStationTemplate(targetList.event, stationAddress),
          getAppDataRelayUrls()
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add favorite");
        console.error("Failed to add favorite:", err);
        return false;
      }
    },
    [createFavoritesList, defaultList, favoritesLists, signAndPublish]
  );

  const removeFavorite = useCallback(
    async (station: StationLike, listId?: string) => {
      const stationAddress = getStationAddress(station);
      if (!stationAddress) {
        return false;
      }

      const targetLists = listId
        ? favoritesLists.filter((list) => list.favoritesId === listId)
        : favoritesLists.filter((list) => hasFavoriteStation(list, stationAddress));

      if (targetLists.length === 0) {
        return false;
      }

      try {
        await Promise.all(
          targetLists.map((list) =>
            signAndPublish(
              buildFavoritesListRemoveStationTemplate(list.event, stationAddress),
              getAppDataRelayUrls()
            )
          )
        );
        return true;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to remove favorite"
        );
        console.error("Failed to remove favorite:", err);
        return false;
      }
    },
    [favoritesLists, signAndPublish]
  );

  const deleteFavoritesList = useCallback(
    async (listId: string) => {
      const list = favoritesLists.find((entry) => entry.favoritesId === listId);
      if (!list) {
        return false;
      }

      try {
        await signAndPublish(
          buildFavoritesListDeletionTemplate(list.event),
          getAppDataRelayUrls()
        );
        return true;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to delete favorites list"
        );
        console.error("Failed to delete favorites list:", err);
        return false;
      }
    },
    [favoritesLists, signAndPublish]
  );

  const isFavoriteInAnyList = useCallback(
    (station: StationLike) => {
      const stationAddress = getStationAddress(station);
      if (!stationAddress) {
        return false;
      }

      return favoritesLists.some((list) => hasFavoriteStation(list, stationAddress));
    },
    [favoritesLists]
  );

  const isFavorite = useCallback(
    (station: StationLike) => isFavoriteInAnyList(station),
    [isFavoriteInAnyList]
  );

  const toggleFavorite = useCallback(
    async (station: StationLike, listId?: string) => {
      if (isFavoriteInAnyList(station)) {
        return removeFavorite(station, listId);
      }

      return addFavorite(station, listId);
    },
    [addFavorite, isFavoriteInAnyList, removeFavorite]
  );

  const clearFavorites = useCallback(async () => {
    try {
      await Promise.all(
        favoritesLists.flatMap((list) =>
          list.stationAddresses.map((stationAddress) =>
            signAndPublish(
              buildFavoritesListRemoveStationTemplate(list.event, stationAddress),
              getAppDataRelayUrls()
            )
          )
        )
      );
      return true;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to clear favorites"
      );
      console.error("Failed to clear favorites:", err);
      return false;
    }
  }, [favoritesLists, signAndPublish]);

  const getFavoriteCount = useCallback(() => {
    return new Set(
      favoritesLists.flatMap((list) => list.stationAddresses)
    ).size;
  }, [favoritesLists]);

  return {
    favoritesLists,
    defaultList,
    isLoading: !eose,
    error,
    isLoggedIn: !!currentAccount,
    currentUser: currentAccount,
    favoritesList: defaultList,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    isFavorite,
    clearFavorites,
    loadFavorites: async () => undefined,
    createFavoritesList,
    updateFavoritesList,
    deleteFavoritesList,
    getFavoriteCount,
    isFavoriteInAnyList,
  };
}

export function useFavoritesLists(
  additionalFilters: Omit<Filter, "kinds">[] = DEFAULT_FAVORITES_LIST_FILTERS
) {
  const filters = useMemo(
    () =>
      additionalFilters.map((filter) => ({
        ...filter,
        kinds: [30078],
        "#l": ["wavefunc_user_favourite_list"],
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(additionalFilters)]
  );

  const { events, eose } = useFavoritesListStream(filters);

  return {
    events,
    eose,
  };
}

export function useFavoriteStations(favoritesList: ParsedFavoritesList | null) {
  const { eventStore, relayPool } = useWavefuncNostr();
  const stationAddresses = favoritesList?.stationAddresses ?? [];

  const filters = useMemo(
    () => addressesToParameterizedFilters(STATION_KIND, stationAddresses),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(stationAddresses)],
  );

  const [eose, setEose] = useState(false);
  useEffect(() => {
    if (stationAddresses.length === 0) {
      setEose(true);
      return;
    }
    setEose(false);
    const subscription = relayPool
      .subscription(getAppDataRelayUrls(), filters)
      .pipe(storeEvents(eventStore))
      .subscribe({
        next: (message) => {
          if (message === "EOSE") setEose(true);
        },
      });
    return () => subscription.unsubscribe();
  }, [eventStore, relayPool, filters, stationAddresses.length]);

  const rawEvents =
    useEventModel(
      TimelineModel,
      stationAddresses.length > 0 ? [filters] : null,
    ) ?? [];

  const stations = useMemo(() => {
    if (stationAddresses.length === 0) return [];
    const byAddress = new Map(
      rawEvents.map((event) => {
        const station = parseStationEvent(event);
        return [station.address, station] as const;
      }),
    );
    return stationAddresses
      .map((address) => byAddress.get(address) ?? null)
      .filter((station): station is NonNullable<typeof station> => station !== null);
  }, [rawEvents, stationAddresses]);

  return {
    stations,
    isLoading: !eose,
    error: null,
  };
}
