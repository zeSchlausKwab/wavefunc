import { createRouter, RouterProvider } from "@tanstack/react-router";
import { registerEventClass, useNDK } from "@nostr-dev-kit/react";
import { useEffect } from "react";
import NDKStation from "./lib/NDKStation";
import { NDKWFFavorites } from "./lib/NDKWFFavorites";
import { routeTree } from "./routeTree.gen";
import { useWalletInit } from "./lib/hooks/useWalletInit";
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
  const restoreLastStation = usePlayerStore((state) => state.restoreLastStation);

  // Initialize wallets from localStorage
  useWalletInit();

  useEffect(() => {
    registerEventClass(NDKStation);
    registerEventClass(NDKWFFavorites);
  }, []);

  // Restore last played station on app load
  useEffect(() => {
    if (ndk) {
      restoreLastStation(ndk);
    }
  }, [ndk, restoreLastStation]);

  return <RouterProvider router={router} />;
}

export default App;
