import { useEffect, useState, useMemo } from "react";
import type { NDKFilter } from "@nostr-dev-kit/ndk";
import { useSubscribe, wrapEvent } from "@nostr-dev-kit/react";
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

  // Build filter once we have the app pubkey - provide a dummy filter when empty
  const filters: NDKFilter[] = useMemo(() => {
    if (!appPubkey) {
      // Return a filter that will never match anything (valid hex but non-existent pubkey)
      return [
        {
          kinds: [30078],
          authors: [
            "0000000000000000000000000000000000000000000000000000000000000000",
          ],
        },
      ];
    }

    return [
      {
        kinds: [30078],
        authors: [appPubkey],
        "#l": ["wavefunc_user_favourite_list"],
      },
    ];
  }, [appPubkey]);

  // Subscribe to events using the standard pattern
  const { events, eose } = useSubscribe(filters, undefined, [appPubkey]);

  // Map events to NDKWFFavorites - only when we have the actual pubkey
  const featuredLists = useMemo(() => {
    if (!appPubkey) return [];
    return events.map((event) => wrapEvent(event) as NDKWFFavorites);
  }, [events, appPubkey]);

  return {
    featuredLists,
    isLoading: pubkeyLoading,
    error: pubkeyError,
    appPubkey,
    eose,
  };
}
