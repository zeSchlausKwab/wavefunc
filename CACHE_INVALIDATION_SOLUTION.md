# Cache Invalidation Solution for Favorites

## Problem

When publishing new favorites data, the UI didn't show feedback immediately. This was caused by:

1. **Missing Cache Adapter**: NDK wasn't configured with a cache adapter, so cached events were persisting
2. **No Cache Invalidation**: After publishing updates, stale cached events remained
3. **No Real-time Subscription**: The UI relied on manual fetches rather than live subscriptions

## Solution

### 1. Added Dexie Cache Adapter (`src/frontend.tsx`)

```typescript
import NDKCacheAdapterDexie from "@nostr-dev-kit/ndk-cache-dexie";

const dexieAdapter = new NDKCacheAdapterDexie({ dbName: "wavefunc-cache" });

<NDKHeadless
  ndk={{
    explicitRelayUrls: [...],
    cacheAdapter: dexieAdapter,  // ✅ Now configured
  }}
  ...
/>
```

**Benefits:**

- Fast in-browser caching using IndexedDB
- Supports cache invalidation via `deleteEventIds()`
- Automatic cache management for events, profiles, and more

### 2. Implemented Cache Invalidation (`src/lib/hooks/useFavorites.ts`)

After publishing any favorites update, we now invalidate the cached event:

```typescript
// Invalidate cache for this favorites list event
if (ndk?.cacheAdapter?.deleteEventIds && targetList.id) {
  await ndk.cacheAdapter.deleteEventIds([targetList.id]);
}

// Then publish
await targetList.sign();
await targetList.publish();
```

This is applied to:

- `addFavorite()` - When adding a station to favorites
- `removeFavorite()` - When removing a station from favorites
- `clearFavorites()` - When clearing all favorites
- All other mutation operations

### 3. Added Real-time Subscription

Instead of just loading favorites once, we now subscribe to updates:

```typescript
useEffect(() => {
  if (!ndk || !currentUser?.pubkey) return;

  // Initial load
  loadFavorites();

  // Set up subscription for real-time updates
  const filter: NDKFilter = {
    kinds: [30078],
    authors: [currentUser.pubkey],
    "#l": ["user_favourite_list"],
  };

  const sub = ndk.subscribe(filter, { closeOnEose: false });

  sub.on("event", (event) => {
    const updatedFavorites = NDKWFFavorites.from(event);

    setFavoritesLists((prevLists) => {
      // Find and update existing list or add new one
      const existingIndex = prevLists.findIndex(
        (list) => list.favoritesId === updatedFavorites.favoritesId
      );

      if (existingIndex !== -1) {
        const newLists = [...prevLists];
        newLists[existingIndex] = updatedFavorites;

        // Update default list if it's the one that changed
        if (defaultList?.favoritesId === updatedFavorites.favoritesId) {
          setDefaultList(updatedFavorites);
        }

        return newLists;
      } else {
        return [...prevLists, updatedFavorites];
      }
    });
  });

  return () => {
    sub?.stop();
  };
}, [ndk, currentUser?.pubkey, loadFavorites, defaultList]);
```

**Benefits:**

- Automatic UI updates when favorites change
- Works across browser tabs/windows
- Receives updates from other clients
- No manual refresh needed

## How It Works Together

### Flow when adding a favorite:

1. **User clicks favorite button**
2. `addFavorite()` is called
3. Station is added to the list object
4. **Cache is invalidated** for that event ID
5. Event is signed and published to relays
6. **Subscription receives the new event** from relay
7. UI updates automatically with fresh data

### Why This Works

This follows the same pattern as TanStack Query's `invalidateCache`:

```typescript
// TanStack Query pattern
await mutate();
queryClient.invalidateQueries(["favorites"]);

// Our NDK pattern
await targetList.publish();
ndk.cacheAdapter.deleteEventIds([targetList.id]); // ✅ Invalidate
// Subscription receives fresh data automatically
```

## NDK Sync Package

While we haven't implemented the `@nostr-dev-kit/sync` package yet, it provides additional benefits:

- **NIP-77 Negentropy**: Efficient set reconciliation for syncing
- **Bandwidth Efficient**: 10-100x less bandwidth for syncs
- **Background Sync**: Sync historical events in the background
- **Capability Tracking**: Caches which relays support Negentropy

You can optionally implement this for even more efficient syncing:

```typescript
import { NDKSync } from "@nostr-dev-kit/sync";

const sync = new NDKSync(ndk);

// Sync and subscribe for complete coverage
const sub = await sync.syncAndSubscribe(
  { kinds: [30078], authors: [currentUser.pubkey] },
  {
    onRelaySynced: (relay, count) => {
      console.log(`Synced ${count} events from ${relay.url}`);
    },
  }
);
```

## References

- [NDK Cache Adapter Documentation](https://github.com/nostr-dev-kit/ndk/tree/master/ndk-cache-dexie)
- [NDK Sync Package](https://github.com/nostr-dev-kit/ndk/tree/master/sync)
- [NIP-77: Negentropy Protocol](https://nips.nostr.com/77)
- [Dexie.js](https://dexie.org/)

## Testing

To test the cache invalidation:

1. Add a favorite station
2. Check browser DevTools → Application → IndexedDB → `wavefunc-cache`
3. Verify that old cached events are removed
4. Verify UI updates immediately
5. Open another browser tab and verify it receives the update

## Future Enhancements

- Implement NDK Sync for bandwidth-efficient syncing
- Add optimistic UI updates (already partially done)
- Add loading states during publish
- Add retry logic for failed publishes
- Add conflict resolution for concurrent edits
