import type { NDKSigner } from "@nostr-dev-kit/ndk";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { registerEventClass, useNDK } from "@nostr-dev-kit/react";
import { useEffect } from "react";
import { NDKWFFavorites } from "./lib/NDKWFFavorites";
import { routeTree } from "./routeTree.gen";
import { useWalletInit } from "./lib/hooks/useWalletInit";
import { createApplesauceSignerFromNDK } from "./lib/nostr/signers/ndk";
import { useWavefuncNostr } from "./lib/nostr/runtime";
import { usePlayerStore } from "./stores/playerStore";
import "./index.css";

// Create a new router instance
const router = createRouter({ routeTree });

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export function App() {
  const { ndk } = useNDK();
  const { clearSigner, eventStore, setSigner } = useWavefuncNostr();
  const restoreLastStation = usePlayerStore((state) => state.restoreLastStation);

  // Initialize wallets from localStorage
  useWalletInit();

  useEffect(() => {
    registerEventClass(NDKWFFavorites);
  }, []);

  useEffect(() => {
    const activeSigner = ndk?.signer as NDKSigner | undefined;

    if (!activeSigner) {
      clearSigner();
      return;
    }

    setSigner(createApplesauceSignerFromNDK(activeSigner)).catch((error) => {
      console.error("Failed to sync Applesauce signer from NDK session", error);
    });
  }, [clearSigner, ndk, setSigner]);

  // Restore last played station on app load
  useEffect(() => {
    restoreLastStation(eventStore);
  }, [eventStore, restoreLastStation]);

  return <RouterProvider router={router} />;
}

export default App;
