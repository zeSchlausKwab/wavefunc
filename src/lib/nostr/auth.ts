import { MailboxesModel, ProfileModel } from "applesauce-core/models";
import { useEventModel } from "applesauce-react/hooks";
import { useMemo } from "react";
import { useWavefuncNostr, type WavefuncAccount } from "./runtime";

type AccountLike = string | { pubkey: string } | null | undefined;

function getPubkey(input: AccountLike) {
  if (!input) {
    return null;
  }

  return typeof input === "string" ? input : input.pubkey;
}

export function useAuth() {
  const {
    currentAccount,
    currentPubkey,
    sessionReady,
    loginWithExtension,
    loginWithPrivateKey,
    loginWithBunker,
    logout,
  } = useWavefuncNostr();

  return {
    currentAccount,
    currentPubkey,
    sessionReady,
    loginWithExtension,
    loginWithPrivateKey,
    loginWithBunker,
    logout,
  };
}

export function useCurrentAccount(): WavefuncAccount | null {
  return useWavefuncNostr().currentAccount;
}

export function useCurrentPubkey(): string | null {
  return useWavefuncNostr().currentPubkey;
}

export function useProfile(user: AccountLike) {
  const pubkey = getPubkey(user);
  // Profile and mailbox models share Applesauce's batched, role-aware loader.
  // Warming NIP-65 metadata here lets replies reach a tagged user's inboxes.
  useEventModel(MailboxesModel, pubkey ? [pubkey] : null);
  return useEventModel(ProfileModel, pubkey ? [pubkey] : null);
}

export function useCurrentProfile() {
  const currentAccount = useCurrentAccount();
  return useProfile(currentAccount);
}

export function useIsLoggedIn() {
  return !!useCurrentAccount();
}

export function useAccountIdentity() {
  const account = useCurrentAccount();

  return useMemo(
    () => ({
      pubkey: account?.pubkey ?? null,
      npub: account?.npub ?? null,
      isLoggedIn: !!account,
    }),
    [account]
  );
}
