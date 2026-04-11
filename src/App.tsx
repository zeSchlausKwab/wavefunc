import { createRouter, RouterProvider } from "@tanstack/react-router";
import { useEffect } from "react";
import { routeTree } from "./routeTree.gen";
import { useWavefuncNostr } from "./lib/nostr/runtime";
import { installTauriBridge } from "./lib/tauriBridge";
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

  // Install the Tauri bridge. No-op in the web build. When running
  // inside Tauri, this pushes player/metadata state to the native
  // tray, listens for media-key events, and routes wavefunc://
  // deep links. Cleanup is async because the listen() calls are.
  useEffect(() => {
    let cleanup: (() => void) | null = null;
    let cancelled = false;
    // The router type parameters are non-empty in the real app;
    // `never, never` is fine for the bridge's purposes since it
    // only uses `router.navigate()` which is type-erased enough.
    installTauriBridge(router as unknown as Parameters<typeof installTauriBridge>[0]).then(
      (fn) => {
        if (cancelled) {
          fn();
          return;
        }
        cleanup = fn;
      }
    );
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return <RouterProvider router={router} />;
}

export default App;
