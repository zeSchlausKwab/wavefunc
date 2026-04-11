import { createRouter, RouterProvider } from "@tanstack/react-router";
import { useEffect } from "react";
import { routeTree } from "./routeTree.gen";
import { useWavefuncNostr } from "./lib/nostr/runtime";
import { installMetadataSubscription } from "./stores/metadataStore";
import { usePlayerStore } from "./stores/playerStore";
import { useSleepTimerStore } from "./stores/sleepTimerStore";
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

  // Restore last played station on app load.
  useEffect(() => {
    restoreLastStation(eventStore);
  }, [eventStore, restoreLastStation]);

  // Install the metadata poll subscription once. It observes the
  // player store and starts/stops fetching when playback state
  // transitions. Decoupled from the player itself so metadata
  // failures never affect audio.
  useEffect(() => {
    return installMetadataSubscription();
  }, []);

  // Rehydrate the sleep timer from localStorage. If the deadline is
  // in the past (app was closed through it), this is a no-op. If it's
  // in the future, a fresh setTimeout is scheduled with the remaining
  // duration.
  useEffect(() => {
    useSleepTimerStore.getState().rehydrate();
  }, []);

  return <RouterProvider router={router} />;
}

export default App;
