import type { CountState } from "applesauce-loaders/loaders";
import { Observable, Subscription } from "rxjs";

export type CommentCountState = {
  count?: CountState;
  fallbackReady: boolean;
  error?: unknown;
};

/** Keep COUNT economical, but bound how long cards wait before loading comments.
 * The scheduler's per-relay timeout does not bound its admission queue. */
export function withCommentCountFallback(
  counts: Observable<CountState>,
  loadFallback: () => Observable<unknown>,
  delayMs = 3000,
): Observable<CommentCountState> {
  return new Observable((subscriber) => {
    let state: CommentCountState = { fallbackReady: false };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let fallback: Subscription | undefined;
    const subscriptions = new Subscription();
    const emit = () => subscriber.next(state);
    const schedule = () => {
      if (
        state.count?.value !== undefined ||
        timer !== undefined ||
        fallback ||
        state.fallbackReady
      )
        return;
      timer = setTimeout(() => {
        timer = undefined;
        const finish = (error?: unknown) => {
          state = { ...state, fallbackReady: !error, error };
          emit();
        };
        try {
          fallback = loadFallback().subscribe({
            complete: () => finish(),
            error: finish,
          });
          subscriptions.add(fallback);
        } catch (error) {
          finish(error);
        }
      }, delayMs);
    };
    subscriptions.add(
      counts.subscribe({
        next: (count) => {
          state = { ...state, count };
          if (count.value !== undefined) {
            clearTimeout(timer);
            timer = undefined;
            fallback?.unsubscribe();
            fallback = undefined;
            state = { ...state, fallbackReady: false, error: undefined };
          }
          emit();
          schedule();
        },
        error: (error) => {
          state = { ...state, error };
          emit();
          schedule();
        },
      }),
    );
    schedule();
    return () => {
      clearTimeout(timer);
      subscriptions.unsubscribe();
    };
  });
}

export function selectCommentCount(state: CommentCountState, loaded: number) {
  const count = state.count;
  const useLoaded =
    loaded > (count?.value ?? -1) && (loaded > 0 || state.fallbackReady);
  return {
    value: useLoaded ? loaded : count?.value,
    lowerBound: useLoaded && !state.fallbackReady,
    origin: useLoaded ? undefined : count?.origin?.relay,
    approximate: useLoaded ? false : count?.approximate,
    fresh: useLoaded ? state.fallbackReady : count?.fresh,
    error: state.error,
  };
}
