/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 *
 * It is included in `src/index.html`.
 */

// Import polyfills first (for crypto.randomUUID, global, process, etc.)
import "./polyfills";

import NDKCacheAdapterDexie from "@nostr-dev-kit/ndk-cache-dexie";
import { NDKHeadless, NDKSessionLocalStorage } from "@nostr-dev-kit/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { config, initConfig } from "./config/env";

// Initialize Dexie cache adapter for efficient caching and cache invalidation
const dexieAdapter = new NDKCacheAdapterDexie({
  dbName: "wavefunc-cache",
  profileCacheSize: 5000,
  eventCacheSize: 10000,
  eventTagsCacheSize: 20000,
  saveSig: true,
});

// Initialize config and render app
async function startApp() {
  await initConfig();

  const elem = document.getElementById("root")!;
  const app = (
    <StrictMode>
      <NDKHeadless
        ndk={{
          explicitRelayUrls: [
            config.relayUrl,
            // "ws://localhost:10547",
            "wss://relay.primal.net",
            "wss://relay.damus.io",
            "wss://purplepag.es",
            "wss://relay.nostr.band",
            "wss://nos.lol",
            "wss://relay.minibits.cash",
            "wss://relay.coinos.io/",
            "wss://relay.nostr.net",
            "wss://nwc.primal.net",
          ],
          cacheAdapter: dexieAdapter,
        }}
        session={{
          storage: new NDKSessionLocalStorage(),
          opts: { follows: true, profile: true },
        }}
      />
      <App />
    </StrictMode>
  );

  if (import.meta.hot) {
    // With hot module reloading, `import.meta.hot.data` is persisted.
    const root = (import.meta.hot.data.root ??= createRoot(elem));
    root.render(app);
  } else {
    // The hot module reloading API is not available in production.
    createRoot(elem).render(app);
  }
}

startApp();
