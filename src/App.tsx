import { createRouter, RouterProvider } from '@tanstack/react-router'
import { registerEventClass } from "@nostr-dev-kit/ndk-hooks";
import { useEffect } from "react";
import NDKStation from "./lib/NDKStation";
import { routeTree } from './routeTree.gen'
import "./index.css";

// Create a new router instance
const router = createRouter({ routeTree })

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

export function App() {
  useEffect(() => {
    registerEventClass(NDKStation);
  }, []);

  return <RouterProvider router={router} />
}

export default App;
