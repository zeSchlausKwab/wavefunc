import { useCallback, useMemo } from "react";
import { useNDK, useNDKCurrentUser, useSubscribe } from "@nostr-dev-kit/react";
import type { NDKFilter } from "@nostr-dev-kit/ndk";
import { NDKWFSongList, SONG_LIST_LABEL } from "../NDKWFSongList";
import { getAppDataSubscriptionOptions } from "../../config/nostr";

export function useSongFavorites() {
  const { ndk } = useNDK();
  const currentUser = useNDKCurrentUser();

  const filters = useMemo<NDKFilter[] | false>(() => {
    return currentUser?.pubkey
      ? [{ kinds: [30078], authors: [currentUser.pubkey], "#l": [SONG_LIST_LABEL] }]
      : false;
  }, [currentUser?.pubkey]);

  const { events, eose } = useSubscribe(filters, getAppDataSubscriptionOptions());

  const songLists = useMemo(() => {
    if (!currentUser?.pubkey) return [];
    return events.map((e) => NDKWFSongList.from(e));
  }, [events, currentUser?.pubkey]);

  const defaultList = useMemo(() => {
    if (!currentUser?.pubkey) return null;
    if (songLists.length > 0) {
      return songLists.find((l) => l.name === "Liked Songs") ?? songLists[0];
    }
    if (eose && ndk) {
      const list = NDKWFSongList.createDefault(ndk);
      list.pubkey = currentUser.pubkey;
      return list;
    }
    return null;
  }, [songLists, eose, currentUser?.pubkey, ndk]);

  const isInAnyList = useCallback(
    (songAddress: string) => songLists.some((l) => l.hasSong(songAddress)),
    [songLists]
  );

  const addToDefaultList = useCallback(
    async (songAddress: string): Promise<boolean> => {
      if (!defaultList) return false;
      try {
        return await defaultList.addSongAndPublish(songAddress);
      } catch (err) {
        console.error("Failed to add song to list:", err);
        return false;
      }
    },
    [defaultList]
  );

  const removeFromAllLists = useCallback(
    async (songAddress: string): Promise<void> => {
      for (const list of songLists) {
        if (list.hasSong(songAddress)) {
          await list.removeSongAndPublish(songAddress).catch(console.error);
        }
      }
    },
    [songLists]
  );

  const createList = useCallback(
    async (name: string): Promise<NDKWFSongList | null> => {
      if (!ndk || !currentUser?.pubkey) return null;
      try {
        const list = NDKWFSongList.createDefault(ndk, name);
        list.pubkey = currentUser.pubkey;
        await list.sign();
        const relays = await list.publish();
        if (relays.size === 0) throw new Error("Failed to publish to any relay");
        return list;
      } catch (err) {
        console.error("Failed to create song list:", err);
        return null;
      }
    },
    [ndk, currentUser?.pubkey]
  );

  const moveSong = useCallback(
    async (songAddress: string, fromListId: string, toListId: string): Promise<void> => {
      const from = songLists.find((l) => l.listId === fromListId);
      const to = songLists.find((l) => l.listId === toListId);
      if (!from || !to) return;
      await to.addSongAndPublish(songAddress).catch(console.error);
      await from.removeSongAndPublish(songAddress).catch(console.error);
    },
    [songLists]
  );

  const removeSongFromList = useCallback(
    async (songAddress: string, listId: string): Promise<void> => {
      const list = songLists.find((l) => l.listId === listId);
      if (!list) return;
      await list.removeSongAndPublish(songAddress).catch(console.error);
    },
    [songLists]
  );

  return {
    songLists,
    defaultList,
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
