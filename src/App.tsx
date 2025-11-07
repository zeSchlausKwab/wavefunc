import { createRouter, RouterProvider } from "@tanstack/react-router";
import { registerEventClass } from "@nostr-dev-kit/react";
import { useEffect } from "react";
import NDKStation from "./lib/NDKStation";
import { NDKWFFavorites } from "./lib/NDKWFFavorites";
import { routeTree } from "./routeTree.gen";
import { useWalletInit } from "./lib/hooks/useWalletInit";
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
  // Initialize wallets from localStorage
  useWalletInit();

  useEffect(() => {
    registerEventClass(NDKStation);
    registerEventClass(NDKWFFavorites);
  }, []);

  return <RouterProvider router={router} />;
}

export default App;
