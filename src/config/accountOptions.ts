import { useSyncExternalStore } from "react";
type Options = { discoverOutboxes: boolean; listeningStatus: boolean };
const defaults: Options = Object.freeze({
  discoverOutboxes: false,
  listeningStatus: false,
});
const values = new Map<string, Options>();
const listeners = new Set<() => void>();
export function getAccountOptions(pubkey: string | null): Options {
  if (!pubkey) return defaults;
  if (!values.has(pubkey)) {
    let stored: Partial<Options> = {};
    try {
      stored =
        JSON.parse(
          localStorage.getItem(`wavefunc:options:${pubkey}`) || "{}",
        ) ?? {};
    } catch {
      /* defaults */
    }
    values.set(pubkey, {
      discoverOutboxes: stored.discoverOutboxes === true,
      listeningStatus: stored.listeningStatus === true,
    });
  }
  return values.get(pubkey)!;
}
export function setAccountOptions(pubkey: string, patch: Partial<Options>) {
  const next = { ...getAccountOptions(pubkey), ...patch };
  localStorage.setItem(`wavefunc:options:${pubkey}`, JSON.stringify(next));
  values.set(pubkey, next);
  listeners.forEach((listener) => listener());
}
export function useAccountOptions(pubkey: string | null) {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => getAccountOptions(pubkey),
    () => defaults,
  );
}
