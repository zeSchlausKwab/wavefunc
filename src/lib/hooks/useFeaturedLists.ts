import { useEffect, useState } from "react";
import type { NDKFilter } from "@nostr-dev-kit/ndk";
import { useNDK } from "@nostr-dev-kit/react";
import { NDKWFFavorites } from "../NDKWFFavorites";

/**
 * Hook to fetch the app's public key from the API
 */
export function useAppPubkey() {
  const [appPubkey, setAppPubkey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAppPubkey() {
      try {
        const response = await fetch("/api/app-pubkey");
        if (!response.ok) {
          throw new Error("Failed to fetch app pubkey");
        }
        const data = await response.json();
        setAppPubkey(data.pubkey);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        console.error("Failed to fetch app pubkey:", err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchAppPubkey();
  }, []);

  return { appPubkey, isLoading, error };
}

/**
 * Hook for subscribing to featured favorites lists (lists created by the app)
 * These are favorites lists signed by the app pubkey
 */
export function useFeaturedLists() {
  const { ndk } = useNDK();
  const {
    appPubkey,
    isLoading: pubkeyLoading,
    error: pubkeyError,
  } = useAppPubkey();

  const [featuredLists, setFeaturedLists] = useState<NDKWFFavorites[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch featured lists when we have an app pubkey
  useEffect(() => {
    if (!ndk || !appPubkey || pubkeyLoading) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    async function fetchFeaturedLists() {
      try {
        // Safety check - these should be defined because of the guard above
        if (!ndk || !appPubkey) return;

        // Ensure NDK is connected
        if (!ndk.pool || ndk.pool.connectedRelays().length === 0) {
          await ndk.connect();
        }

        const filter: NDKFilter = {
          kinds: [30078],
          authors: [appPubkey],
          "#l": ["wavefunc_user_favourite_list"],
        };

        const events = await ndk.fetchEvents(filter);

        if (!cancelled) {
          const lists = Array.from(events).map((event) =>
            NDKWFFavorites.from(event)
          );
          setFeaturedLists(lists);
          setIsLoading(false);
        }
      } catch (err) {
        console.error("Failed to fetch featured lists:", err);
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchFeaturedLists();

    return () => {
      cancelled = true;
    };
  }, [ndk, appPubkey, pubkeyLoading]);

  return {
    featuredLists,
    isLoading: pubkeyLoading || isLoading,
    error: pubkeyError,
    appPubkey,
  };
}
