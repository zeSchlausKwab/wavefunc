import { useCallback } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Per-account "preferred mint" preference. The key is the user's pubkey
 * because a single browser may host multiple accounts (cf. AccountManager).
 *
 * The preference is a *hint*, not a hard rule:
 *   - SendCashu / ReceiveLightning / Nutzap default the mint dropdown to it
 *     so the user sees their preference pre-selected (and can override).
 *   - PayLightning passes it to `TokensOperation` only when it has any
 *     balance — `TokensOperation` will throw if the chosen mint is short of
 *     funds, so the caller is responsible for the safety check.
 *   - When no preferred mint is set (or it has zero balance), callers should
 *     fall back to `pickMintByHighestBalance(balance)`.
 *
 * Keep the API surface tiny — this store has one job.
 */

interface PreferredMintState {
  byPubkey: Record<string, string>;
  setPreferredMint: (pubkey: string, mint: string) => void;
  clearPreferredMint: (pubkey: string) => void;
}

export const usePreferredMintStore = create<PreferredMintState>()(
  persist(
    (set) => ({
      byPubkey: {},
      setPreferredMint: (pubkey, mint) =>
        set((state) => ({
          byPubkey: { ...state.byPubkey, [pubkey]: mint },
        })),
      clearPreferredMint: (pubkey) =>
        set((state) => {
          if (!state.byPubkey[pubkey]) return state;
          const { [pubkey]: _removed, ...rest } = state.byPubkey;
          return { byPubkey: rest };
        }),
    }),
    {
      name: "wavefunc:preferred-mint:v1",
    }
  )
);

/** Reactive read of the current account's preferred mint URL. */
export function usePreferredMint(pubkey: string | null | undefined): string | null {
  return usePreferredMintStore((s) =>
    pubkey ? s.byPubkey[pubkey] ?? null : null
  );
}

/** Stable callback for writing the current account's preferred mint. */
export function useSetPreferredMint(pubkey: string | null | undefined) {
  const set = usePreferredMintStore((s) => s.setPreferredMint);
  const clear = usePreferredMintStore((s) => s.clearPreferredMint);
  return useCallback(
    (mint: string | null) => {
      if (!pubkey) return;
      if (mint) set(pubkey, mint);
      else clear(pubkey);
    },
    [pubkey, set, clear]
  );
}

/**
 * Returns the mint with the largest balance, optionally restricted to a set
 * of candidate mint URLs. Returns `undefined` if no mint has any balance.
 */
export function pickMintByHighestBalance(
  balance: Record<string, number> | undefined,
  candidates?: string[]
): string | undefined {
  if (!balance) return undefined;
  const entries = Object.entries(balance).filter(([mint, amount]) => {
    if (amount <= 0) return false;
    if (candidates && !candidates.includes(mint)) return false;
    return true;
  });
  if (entries.length === 0) return undefined;
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0]![0];
}

/**
 * Resolves the *effective* mint to spend from given a preference and the
 * current balance. The preference is honored only when:
 *   1. it has a positive balance, AND
 *   2. it is in the candidate set (if one was provided — used for nutzaps,
 *      where the recipient dictates which mints we may use).
 *
 * Falls back to the highest-balance candidate when the preference can't be
 * honored. Returns `undefined` when no candidate has any balance.
 */
export function pickEffectiveMint(
  preferred: string | null | undefined,
  balance: Record<string, number> | undefined,
  candidates?: string[]
): string | undefined {
  if (!balance) return undefined;
  if (
    preferred &&
    (balance[preferred] ?? 0) > 0 &&
    (!candidates || candidates.includes(preferred))
  ) {
    return preferred;
  }
  return pickMintByHighestBalance(balance, candidates);
}
