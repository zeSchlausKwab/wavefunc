import { atom } from "jotai";
import {
  NDKPrivateKeySigner,
  NDKUser,
  NDKNip07Signer,
  NDKNip46Signer,
  NDKSigner,
} from "@nostr-dev-kit/ndk";
import { nostrService } from "@/services/ndk";

interface AuthState {
  isAuthenticated: boolean;
  user?: NDKUser;
  signer?: NDKSigner;
}

// Initialize auth state from localStorage if available
const getInitialAuthState = async (): Promise<AuthState> => {
  if (typeof window === "undefined") {
    return { isAuthenticated: false };
  }

  const savedAuth = localStorage.getItem("AUTH_STATE");
  const savedPrivateKey = localStorage.getItem("NOSTR_LOCAL_SIGNER_KEY");

  if (savedAuth) {
    try {
      const parsed = JSON.parse(savedAuth);
      // Only restore if we have a valid user pubkey
      if (parsed.user?.pubkey) {
        // If we have a saved private key, restore the signer
        if (savedPrivateKey) {
          const signer = new NDKPrivateKeySigner(savedPrivateKey);
          await signer.blockUntilReady();
          nostrService.setSigner(signer);
          const user = await signer.user();
          return {
            isAuthenticated: true,
            user,
            signer,
          };
        }

        // If we have a saved NIP-07 signer and window.nostr is available
        if (window.nostr) {
          try {
            const signer = new NDKNip07Signer();
            await signer.blockUntilReady();
            nostrService.setSigner(signer);
            const user = await signer.user();
            return {
              isAuthenticated: true,
              user,
              signer,
            };
          } catch (error) {
            console.warn("Failed to restore NIP-07 signer:", error);
          }
        }

        // If no signer could be restored but we have user data
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

// Create a loading atom to track initialization
export const authLoadingAtom = atom<boolean>(true);

// Create an async atom that initializes auth state
const initAuthStateAtom = atom<Promise<AuthState>>(getInitialAuthState());

// Create the main auth state atom that depends on the async initialization
export const authStateAtom = atom(
  async (get) => {
    const authState = await get(initAuthStateAtom);
    return authState;
  },
  (_get, set, update: AuthState) => {
    set(authStateAtom, update);
  }
);

export const loginDialogAtom = atom<boolean>(false);

const updateAuthState = async (signer: NDKSigner): Promise<AuthState> => {
  const ndk = nostrService.getNDK();
  nostrService.setSigner(signer);
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
  nostrService.setSigner(null);
  set(authStateAtom, { isAuthenticated: false });
  localStorage.removeItem("AUTH_STATE");
  localStorage.removeItem("NOSTR_CONNECT_KEY");
  localStorage.removeItem("NOSTR_LOCAL_SIGNER_KEY");
});
