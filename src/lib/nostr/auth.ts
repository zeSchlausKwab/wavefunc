import { MailboxesModel, ProfileModel } from "applesauce-core/models";
import { useEventModel } from "applesauce-react/hooks";
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

export function useProfile(user: AccountLike) {
  const pubkey = getPubkey(user);
  // Profile and mailbox models share Applesauce's batched, role-aware loader.
  // Warming NIP-65 metadata here lets replies reach a tagged user's inboxes.
  useEventModel(MailboxesModel, pubkey ? [pubkey] : null);
  return useEventModel(ProfileModel, pubkey ? [pubkey] : null);
}
