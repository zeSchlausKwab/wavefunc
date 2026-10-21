import { useEffect, useMemo, useState } from "react";
import type { NostrEvent } from "nostr-tools";
import { getSocialRelayUrls } from "../../../config/nostr";
import { useProfile } from "../auth";
import { eventStore, publishedEvents$, relayPool } from "../store";
import {
  SUPPORT_NAMESPACE,
  SUPPORT_PUBKEY,
  supportLedger,
  verifySupportReceipt,
  type SupportProvider,
} from "../support";
import {
  loadSupportEndpoint,
  loadSupportHistory,
  supportRelayRequest,
} from "../supportService";

export function useAppSupport() {
  const profile = useProfile(SUPPORT_PUBKEY);
  const [events, setEvents] = useState<NostrEvent[]>([]);
  const [provider, setProvider] = useState<SupportProvider | null>(null);
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [partial, setPartial] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const relays = getSocialRelayUrls().slice(0, 6);
  const relaysKey = JSON.stringify(relays);
  useEffect(() => {
    const controller = new AbortController();
    const seen = new Map<string, NostrEvent>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    setEvents([]);
    setLoading(true);
    setPartial(false);
    const emit = (batch: NostrEvent[]) => {
      if (controller.signal.aborted) return;
      for (const event of batch)
        if (eventStore.add(event)) seen.set(event.id, event);
      if (!timer)
        timer = setTimeout(() => {
          timer = undefined;
          if (!controller.signal.aborted) setEvents([...seen.values()]);
        }, 50);
    };
    const filters = [
      { kinds: [9735], "#p": [SUPPORT_PUBKEY] },
      { kinds: [1985], authors: [SUPPORT_PUBKEY], "#L": [SUPPORT_NAMESPACE] },
    ];
    const boundary = Math.floor(Date.now() / 1000);
    const live = relayPool
      .subscription(
        relays,
        filters.map((f) => ({ ...f, since: boundary })),
        { waitForAuth: false },
      )
      .subscribe({
        next: (event) => emit([event]),
        error: () => setPartial(true),
      });
    const local = publishedEvents$.subscribe((event) => {
      if (event.kind === 1985 && event.pubkey === SUPPORT_PUBKEY) emit([event]);
    });
    void Promise.allSettled(
      relays.flatMap((relay) =>
        filters.map((filter) =>
          loadSupportHistory(
            supportRelayRequest(relayPool, relay, controller.signal),
            filter,
            controller.signal,
            emit,
            boundary,
          ),
        ),
      ),
    ).then((results) => {
      if (!controller.signal.aborted) {
        setPartial(
          (value) =>
            value || results.some((r) => r.status === "rejected" || !r.value),
        );
        setLoading(false);
      }
    });
    return () => {
      controller.abort();
      live.unsubscribe();
      local.unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [relaysKey, attempt]);
  useEffect(() => {
    const controller = new AbortController();
    setProvider(null);
    setError(null);
    setValidating(true);
    if (!profile?.lud16) {
      const timer = setTimeout(() => {
        setValidating(false);
        setError("The support Lightning address could not be loaded.");
      }, 10_000);
      return () => {
        clearTimeout(timer);
        controller.abort();
      };
    }
    void loadSupportEndpoint(profile.lud16, controller.signal)
      .then((endpoint) => {
        if (controller.signal.aborted) return;
        if (!endpoint.allowsNostr)
          throw new Error(
            "The Lightning provider does not support public zap receipts.",
          );
        setProvider(endpoint);
        setValidating(false);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setError(
            error instanceof Error
              ? error.message
              : "Receipt verification unavailable.",
          );
          setValidating(false);
        }
      });
    return () => controller.abort();
  }, [profile?.lud16, attempt]);
  const result = useMemo(
    () =>
      supportLedger(
        provider
          ? events.flatMap((event) => {
              const receipt = verifySupportReceipt(event, provider);
              return receipt ? [receipt] : [];
            })
          : [],
        events,
      ),
    [events, provider],
  );
  return {
    ...result,
    loading: loading || validating,
    error,
    partial,
    retry: () => setAttempt((n) => n + 1),
    relays,
  };
}
