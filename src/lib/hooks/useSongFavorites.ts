import type { Filter } from "applesauce-core/helpers/filter";
import { use$ } from "applesauce-react/hooks";
import { storeEvents } from "applesauce-relay/operators";
import { useCallback, useMemo } from "react";
import { map, of, scan, startWith } from "rxjs";
import { getAppDataRelayUrls } from "../../config/nostr";
import { useCurrentAccount } from "../nostr/auth";
import {
  buildSongAudioUpdateTemplate,
  buildSongListAddSongTemplate,
  buildSongListRemoveSongTemplate,
  buildSongListTemplate,
  buildSongTemplateFromMetadata,
  deriveSongIdFromMetadata,
  getSongAddressForPubkey,
  parseSongListEvent,
  SONG_LIST_LABEL,
  songListHasSong,
  type ParsedSongList,
  type SongMetadataInput,
  WF_SONG_LIST_KIND,
} from "../nostr/domain";
import { useWavefuncNostr } from "../nostr/runtime";

const DEFAULT_LIST_NAME = "Liked Songs";

export function useSongFavorites() {
  const currentUser = useCurrentAccount();
  const { eventStore, relayPool, signAndPublish } = useWavefuncNostr();
  const relays = getAppDataRelayUrls();
  const relaysKey = JSON.stringify(relays);

  const filters: Filter[] = useMemo(() => {
    if (!currentUser?.pubkey) return [];
    return [
      {
        kinds: [WF_SONG_LIST_KIND],
        authors: [currentUser.pubkey],
        "#l": [SONG_LIST_LABEL],
      },
    ];
  }, [currentUser?.pubkey]);

  const filtersKey = JSON.stringify(filters);

  const eose =
    use$(
      () => {
        if (filters.length === 0) return of(true);
        return relayPool.subscription(relays, filters).pipe(
          storeEvents(eventStore),
          map((message) => message === "EOSE"),
          startWith(false),
          scan((done, current) => done || current, false),
        );
      },
      [eventStore, filtersKey, relayPool, relaysKey],
    ) ?? false;

  const events =
    use$(
      () => {
        if (filters.length === 0) return of([]);
        return eventStore
          .timeline(filters)
          .pipe(map((timeline) => [...timeline]));
      },
      [eventStore, filtersKey],
    ) ?? [];

  const songLists: ParsedSongList[] = useMemo(
    () => events.map((event) => parseSongListEvent(event)),
    [events],
  );

  const isInAnyList = useCallback(
    (songAddress: string) =>
      songLists.some((list) => songListHasSong(list, songAddress)),
    [songLists],
  );

  const findOrCreateDefaultList = useCallback(async (): Promise<
    ParsedSongList | null
  > => {
    if (!currentUser?.pubkey) return null;

    const existing =
      songLists.find((list) => list.name === DEFAULT_LIST_NAME) ??
      songLists[0];
    if (existing) return existing;

    // No list yet — publish a fresh "Liked Songs" list and return its parsed form.
    const template = buildSongListTemplate({ name: DEFAULT_LIST_NAME });
    const event = await signAndPublish(template);
    return parseSongListEvent(event);
  }, [currentUser?.pubkey, signAndPublish, songLists]);

  const addToDefaultList = useCallback(
    async (songAddress: string): Promise<boolean> => {
      const list = await findOrCreateDefaultList();
      if (!list) return false;
      try {
        if (songListHasSong(list, songAddress)) return false;
        const template = buildSongListAddSongTemplate(list.event, songAddress);
        await signAndPublish(template);
        return true;
      } catch (err) {
        console.error("Failed to add song to list:", err);
        return false;
      }
    },
    [findOrCreateDefaultList, signAndPublish],
  );

  const removeFromAllLists = useCallback(
    async (songAddress: string): Promise<void> => {
      for (const list of songLists) {
        if (!songListHasSong(list, songAddress)) continue;
        try {
          const template = buildSongListRemoveSongTemplate(
            list.event,
            songAddress,
          );
          await signAndPublish(template);
        } catch (err) {
          console.error("Failed to remove song from list:", err);
        }
      }
    },
    [signAndPublish, songLists],
  );

  const createList = useCallback(
    async (name: string): Promise<ParsedSongList | null> => {
      if (!currentUser?.pubkey) return null;
      try {
        const template = buildSongListTemplate({ name });
        const event = await signAndPublish(template);
        return parseSongListEvent(event);
      } catch (err) {
        console.error("Failed to create song list:", err);
        return null;
      }
    },
    [currentUser?.pubkey, signAndPublish],
  );

  const moveSong = useCallback(
    async (
      songAddress: string,
      fromListId: string,
      toListId: string,
    ): Promise<void> => {
      const from = songLists.find((l) => l.listId === fromListId);
      const to = songLists.find((l) => l.listId === toListId);
      if (!from || !to) return;
      try {
        const addTemplate = buildSongListAddSongTemplate(to.event, songAddress);
        await signAndPublish(addTemplate);
        const removeTemplate = buildSongListRemoveSongTemplate(
          from.event,
          songAddress,
        );
        await signAndPublish(removeTemplate);
      } catch (err) {
        console.error("Failed to move song:", err);
      }
    },
    [signAndPublish, songLists],
  );

  const removeSongFromList = useCallback(
    async (songAddress: string, listId: string): Promise<void> => {
      const list = songLists.find((l) => l.listId === listId);
      if (!list) return;
      try {
        const template = buildSongListRemoveSongTemplate(list.event, songAddress);
        await signAndPublish(template);
      } catch (err) {
        console.error("Failed to remove song:", err);
      }
    },
    [signAndPublish, songLists],
  );

  return {
    songLists,
    isLoading: !eose,
    isLoggedIn: !!currentUser?.pubkey,
    isInAnyList,
    addToDefaultList,
    removeFromAllLists,
    createList,
    moveSong,
    removeSongFromList,
  };
}

/**
 * Re-export builder helpers that are commonly used together with this hook so
 * the consuming components only have to import from one place. Mirrors the
 * useFavorites pattern from the favorites slice.
 */
export {
  buildSongAudioUpdateTemplate,
  buildSongTemplateFromMetadata,
  deriveSongIdFromMetadata,
  getSongAddressForPubkey,
  type SongMetadataInput,
};
