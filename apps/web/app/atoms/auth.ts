import { atom } from "jotai";
import {
  NDKPrivateKeySigner,
  NDKUser,
  NDKNip07Signer,
  NDKNip46Signer,
} from "@nostr-dev-kit/ndk";
import { nostrService } from "@/services/ndk";

interface AuthState {
  isAuthenticated: boolean;
  user?: NDKUser;
  signer?: NDKPrivateKeySigner | NDKNip07Signer | NDKNip46Signer;
}

// Initialize auth state from localStorage if available
const getInitialAuthState = (): AuthState => {
  if (typeof window === "undefined") {
    return { isAuthenticated: false };
  }

  const savedAuth = localStorage.getItem("AUTH_STATE");
  if (savedAuth) {
    try {
      const parsed = JSON.parse(savedAuth);
      // Only restore if we have a valid user pubkey
      if (parsed.user?.pubkey) {
        return {
          isAuthenticated: true,
          user: parsed.user,
        };
      }
    } catch (error) {
      console.error("Failed to parse saved auth state:", error);
    }
  }
  return { isAuthenticated: false };
};

export const authStateAtom = atom<AuthState>(getInitialAuthState());

export const loginDialogAtom = atom<boolean>(false);

const updateAuthState = async (
  signer: NDKPrivateKeySigner | NDKNip07Signer | NDKNip46Signer
): Promise<AuthState> => {
  const ndk = nostrService.getNDK();
  ndk.signer = signer;
  const user = await signer.user();
  await user.fetchProfile();

  const authState = {
    isAuthenticated: true,
    user,
    signer,
  };

  // Save to localStorage
  if (typeof window !== "undefined") {
    localStorage.setItem(
      "AUTH_STATE",
      JSON.stringify({
        isAuthenticated: true,
        user: {
          pubkey: user.pubkey,
          profile: user.profile,
        },
      })
    );
  }

  return authState;
};

export const loginWithPrivateKey = atom(
  null,
  async (get, set, privateKey: string) => {
    try {
      const signer = new NDKPrivateKeySigner(privateKey);
      await signer.blockUntilReady();
      const authState = await updateAuthState(signer);
      set(authStateAtom, authState);
      set(loginDialogAtom, false);
    } catch (error) {
      console.error("Private key login failed:", error);
      throw error;
    }
  }
);

export const loginWithNip46 = atom(
  null,
  async (get, set, signer: NDKNip46Signer) => {
    try {
      const authState = await updateAuthState(signer);
      set(authStateAtom, authState);
      set(loginDialogAtom, false);
    } catch (error) {
      console.error("NIP-46 login failed:", error);
      throw error;
    }
  }
);

export const loginWithExtension = atom(null, async (get, set) => {
  try {
    if (typeof window === "undefined" || !window.nostr) {
      throw new Error("No Nostr extension found");
    }

    const signer = new NDKNip07Signer();
    await signer.blockUntilReady();
    const authState = await updateAuthState(signer);
    set(authStateAtom, authState);
    set(loginDialogAtom, false);
  } catch (error) {
    console.error("Extension login failed:", error);
    throw error;
  }
});

export const logout = atom(null, (get, set) => {
  const ndk = nostrService.getNDK();
  ndk.signer = undefined;
  set(authStateAtom, { isAuthenticated: false });
  localStorage.removeItem("AUTH_STATE");
  localStorage.removeItem("NOSTR_CONNECT_KEY");
  localStorage.removeItem("NOSTR_LOCAL_SIGNER_KEY");
});
