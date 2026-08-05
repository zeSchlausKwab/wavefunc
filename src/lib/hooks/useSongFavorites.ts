// Reactive song-list state backed by the shared, persistent relay query.

import type { Filter } from "applesauce-core/helpers/filter";
import { useCallback, useMemo } from "react";
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
import { useAppDataTimeline } from "../nostr/hooks/useRelayTimeline";

const DEFAULT_LIST_NAME = "Liked Songs";

export function useSongFavorites() {
  const currentUser = useCurrentAccount();
  const { signAndPublish } = useWavefuncNostr();

  const filters: Filter[] | null = useMemo(() => {
    if (!currentUser?.pubkey) return null;
    return [
      {
        kinds: [WF_SONG_LIST_KIND],
        authors: [currentUser.pubkey],
        "#l": [SONG_LIST_LABEL],
      },
    ];
  }, [currentUser?.pubkey]);

  const { events, isLoading } = useAppDataTimeline(filters);

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
        throw err;
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
    isLoading,
    isLoggedIn: !!currentUser?.pubkey,
    isInAnyList,
    addToDefaultList,
    removeFromAllLists,
    createList,
    moveSong,
    removeSongFromList,
  };
}

export {
  buildSongAudioUpdateTemplate,
  buildSongTemplateFromMetadata,
  deriveSongIdFromMetadata,
  getSongAddressForPubkey,
  type SongMetadataInput,
};
