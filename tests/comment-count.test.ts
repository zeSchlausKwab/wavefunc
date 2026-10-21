import { expect, test } from "bun:test";
import {
  BehaviorSubject,
  firstValueFrom,
  of,
  filter,
  timeout,
  throwError,
} from "rxjs";
import type { CountState } from "applesauce-loaders/loaders";
import {
  withCommentCountFallback,
  selectCommentCount,
} from "../src/lib/nostr/commentCount";
const pending: CountState = {
  value: undefined,
  refreshing: true,
  fresh: false,
  origin: undefined,
  approximate: undefined,
  observedAt: undefined,
  failure: undefined,
};

test("a scheduler still refreshing cannot prevent a successful comment fallback", async () => {
  const counts = new BehaviorSubject(pending);
  let loaded = 0;
  const result = await firstValueFrom(
    withCommentCountFallback(
      counts,
      () => {
        loaded = 1;
        return of({ kind: 1111 });
      },
      10,
    ).pipe(
      filter((s) => s.fallbackReady),
      timeout(200),
    ),
  );
  expect(selectCommentCount(result, loaded).value).toBe(1);
});

test("a known or just-posted comment remains visible while COUNT is unavailable or stale", () => {
  const known = selectCommentCount({ count: pending, fallbackReady: false }, 1);
  expect(known.value).toBe(1);
  expect(known.lowerBound).toBe(true);
  const stale = selectCommentCount(
    {
      count: {
        ...pending,
        value: 0,
        refreshing: false,
        fresh: true,
        origin: { relay: "wss://relay.example" },
      },
      fallbackReady: false,
    },
    2,
  );
  expect(stale.value).toBe(2);
  expect(stale.lowerBound).toBe(true);
  expect(stale.origin).toBeUndefined();
});

test("a fast successful COUNT cancels the fallback and retains its provenance", async () => {
  const count = {
    ...pending,
    value: 5,
    refreshing: false,
    fresh: true,
    origin: { relay: "wss://relay.example" },
  };
  let reads = 0;
  const sub = withCommentCountFallback(
    of(count),
    () => {
      reads++;
      return of({});
    },
    10,
  ).subscribe();
  await Bun.sleep(30);
  sub.unsubscribe();
  expect(reads).toBe(0);
  expect(selectCommentCount({ count, fallbackReady: false }, 1)).toMatchObject({
    value: 5,
    lowerBound: false,
    origin: "wss://relay.example",
    fresh: true,
  });
});

test("failed fallback stays unknown when no comments are known; teardown cancels queued reads", async () => {
  const counts = new BehaviorSubject({ ...pending, refreshing: false });
  const failed = await firstValueFrom(
    withCommentCountFallback(
      counts,
      () => throwError(() => new Error("offline")),
      10,
    ).pipe(
      filter((s) => !!s.error),
      timeout(200),
    ),
  );
  expect(selectCommentCount(failed, 0).value).toBeUndefined();
  expect(selectCommentCount(failed, 1).value).toBe(1);
  let reads = 0;
  const sub = withCommentCountFallback(
    counts,
    () => {
      reads++;
      return of({});
    },
    10,
  ).subscribe();
  sub.unsubscribe();
  await Bun.sleep(30);
  expect(reads).toBe(0);
});
