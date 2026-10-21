import { useEffect, useMemo } from "react";
import { use$ } from "applesauce-react/hooks";
import { createCountService } from "applesauce-loaders/loaders";
import { map, merge, Observable } from "rxjs";
import { storeEvents } from "applesauce-relay/operators";
import type { NostrEvent } from "applesauce-core/helpers/event";
import { getRelayPolicy, getSocialRelayUrls } from "../../../config/nostr";
import { relayPreferences } from "../../../config/relayPreferences";
import {
  eventStore,
  loadCommentsByAddress,
  loadLegacyCommentsByAddress,
  loadCommentsByEvent,
  relayPool,
  publishedEvents$,
  socialReadErrors$,
} from "../store";
import { useRelayTimeline } from "./useRelayTimeline";
import { withCommentCountFallback } from "../commentCount";

const globals = globalThis as typeof globalThis & {
  __wavefuncCounts?: ReturnType<typeof createCountService>;
};
export const commentCounts = (globals.__wavefuncCounts ??= createCountService(
  relayPool,
  {
    // The app relay restricts COUNT to station queries. Social counts use compatible personal/public relays.
    relays: relayPreferences.state$.pipe(
      map(() =>
        getRelayPolicy().stage === "development"
          ? []
          : getRelayPolicy().generalRead,
      ),
    ),
    concurrency: 4,
    attemptTimeout: 3_000,
    cacheCapacity: 500,
  },
));

type Target = Pick<
  NostrEvent,
  "id" | "kind" | "tags" | "pubkey" | "created_at"
>;
export function useCommentCount(
  event: Target,
  pubkey: string | undefined,
  enabled: boolean,
) {
  const preferences = use$(relayPreferences.state$);
  const address = event.tags.find((tag) => tag[0] === "d")?.[1];
  const target = useMemo(
    () => ({
      id: event.id,
      kind: event.kind,
      created_at: event.created_at,
      address:
        address === undefined
          ? undefined
          : `${event.kind}:${event.pubkey}:${address}`,
    }),
    [event.id, event.kind, event.pubkey, event.created_at, address],
  );
  useEffect(() => {
    const subscription = publishedEvents$.subscribe((event) => {
      if (
        event.kind === 1111 &&
        event.tags.some(([name, value]) =>
          target.address
            ? name === "A" && value === target.address
            : name === "E" && value === target.id,
        )
      ) {
        void commentCounts.invalidate(target).catch(() => {});
      }
    });
    return () => subscription.unsubscribe();
  }, [target]);
  const handle = useMemo(() => commentCounts.event(target), [target]);
  const relays = useMemo(() => getSocialRelayUrls(), [preferences]);
  const filters = useMemo(
    () =>
      target.address
        ? [
            { kinds: [1111], "#A": [target.address] },
            { kinds: [1111], "#a": [target.address] },
          ]
        : [
            { kinds: [1111], "#E": [target.id] },
            { kinds: [1111], "#e": [target.id] },
          ],
    [target],
  );
  // A personal badge does not require downloading everyone else's comments.
  useRelayTimeline({
    filters:
      enabled && pubkey
        ? filters.map((filter) => ({ ...filter, authors: [pubkey] }))
        : null,
    relays,
  });
  const status = useMemo(
    () =>
      withCommentCountFallback(
        handle.comments,
        () =>
          new Observable((subscriber) => {
            let failure: unknown;
            const errors = socialReadErrors$.subscribe(({ values, error }) => {
              if (values.includes(target.address ?? target.id)) failure = error;
            });
            const streams = target.address
              ? [
                  loadCommentsByAddress({ value: target.address, relays }),
                  loadLegacyCommentsByAddress({
                    value: target.address,
                    relays,
                  }),
                ]
              : [loadCommentsByEvent({ value: target.id, relays })];
            const subscription = merge(...streams)
              .pipe(storeEvents(eventStore))
              .subscribe({
                next: (event) => subscriber.next(event),
                complete: () =>
                  failure ? subscriber.error(failure) : subscriber.complete(),
                error: (error) => subscriber.error(error),
              });
            return () => {
              subscription.unsubscribe();
              errors.unsubscribe();
            };
          }),
      ),
    [handle, target, relays],
  );
  return use$(enabled ? status : undefined) ?? { fallbackReady: false };
}
