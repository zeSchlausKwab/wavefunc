import { useEffect, useState } from "react";
import type { NDKFilter } from "@nostr-dev-kit/ndk";
import { useNDK, useSubscribe, wrapEvent } from "@nostr-dev-kit/react";
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
  const {
    appPubkey,
    isLoading: pubkeyLoading,
    error: pubkeyError,
  } = useAppPubkey();

  // Build filters - use a non-matching filter if no pubkey yet to avoid subscription errors
  const filters: NDKFilter[] = appPubkey
    ? [
        {
          kinds: [30078], // Favorites list kind
          authors: [appPubkey],
          // All favorites lists by the app are featured - no special label needed
        },
      ]
    : [
        {
          kinds: [30078],
          authors: [
            "0000000000000000000000000000000000000000000000000000000000000000",
          ], // Dummy pubkey that won't match
        },
      ];

  // Subscribe to the featured lists
  const { events, eose } = useSubscribe(filters);

  // Convert events to NDKWFFavorites objects (only if we have a real pubkey)
  const featuredLists = appPubkey
    ? events.map((event) => wrapEvent(event) as NDKWFFavorites)
    : [];

  return {
    featuredLists,
    isLoading:
      pubkeyLoading || (!eose && featuredLists.length === 0 && !!appPubkey),
    error: pubkeyError,
    appPubkey,
  };
}
