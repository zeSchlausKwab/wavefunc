import { createRouter, RouterProvider } from "@tanstack/react-router";
import { useEffect } from "react";
import { routeTree } from "./routeTree.gen";
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
  const { eventStore } = useWavefuncNostr();
  const restoreLastStation = usePlayerStore((state) => state.restoreLastStation);

  // Restore last played station on app load
  useEffect(() => {
    restoreLastStation(eventStore);
  }, [eventStore, restoreLastStation]);

  return <RouterProvider router={router} />;
}

export default App;
