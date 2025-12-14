# Class-Based Mutation Architecture

## Overview

We've refactored the codebase to follow a **class-based mutation pattern**, similar to Active Record or Domain-Driven Design principles. This moves business logic from React hooks into the entity classes themselves.

## The Pattern

### Before: Hook-Heavy Approach

Previously, mutation logic was scattered across React hooks:

```typescript
// In useFavorites hook
const addFavorite = async (station: NDKStation) => {
  targetList.addStation(stationAddress);

  // Cache invalidation in hook
  if (ndk?.cacheAdapter?.deleteEventIds && targetList.id) {
    await ndk.cacheAdapter.deleteEventIds([targetList.id]);
  }

  // Publishing in hook
  await targetList.sign();
  await targetList.publish();

  // State management in hook
  setFavoritesLists((prev) => [...prev]);
};
```

**Problems:**

- Business logic mixed with UI state management
- Hard to reuse outside of React components
- Difficult to test independently
- Violates Single Responsibility Principle

### After: Class-Based Approach

Now, mutation logic lives in the entity classes:

```typescript
// In NDKWFFavorites class
async addStationAndPublish(stationAddress: string): Promise<boolean> {
  if (this.hasStation(stationAddress)) {
    return false;
  }

  this.addStation(stationAddress);

  // Cache invalidation in class
  if (this.ndk?.cacheAdapter?.deleteEventIds && this.id) {
    await this.ndk.cacheAdapter.deleteEventIds([this.id]);
  }

  // Publishing in class
  await this.sign();
  await this.publish();

  return true;
}
```

```typescript
// In hook - much simpler!
const addFavorite = async (station: NDKStation) => {
  const added = await targetList.addStationAndPublish(stationAddress);

  if (added) {
    // Only state management in hook
    setFavoritesLists((prev) =>
      prev.map((list) =>
        list.favoritesId === targetList.favoritesId ? targetList : list
      )
    );
  }

  return added;
};
```

**Benefits:**

- ✅ Clear separation of concerns
- ✅ Business logic encapsulated in entities
- ✅ Hooks only manage UI state
- ✅ Testable without React
- ✅ Reusable anywhere in the codebase

## Implementation

### NDKWFFavorites Class

Added methods that combine mutation + publishing + cache invalidation:

- `async addStationAndPublish(stationAddress, relay?): Promise<boolean>`
- `async removeStationAndPublish(stationAddress): Promise<boolean>`
- `async toggleStationAndPublish(stationAddress, relay?): Promise<boolean>`
- `async clearStationsAndPublish(): Promise<boolean>`

Each method:

1. Performs the mutation
2. Invalidates the cache
3. Signs the event
4. Publishes to relays
5. Returns success/failure

### NDKStation Class

Added similar methods for stream management:

- `async addStreamAndPublish(stream): Promise<void>`
- `async removeStreamAndPublish(url): Promise<boolean>`
- `async updateStreamAndPublish(url, updates): Promise<boolean>`

### Hook Simplification

The `useFavorites` hook now:

1. Calls the class methods
2. Updates React state for re-rendering
3. Handles errors and loading states

**Before:**

```typescript
const addFavorite = useCallback(
  async (station: NDKStation) => {
    // 40 lines of business logic + cache + publish + state management
  },
  [favoritesLists, defaultList, ndk]
);
```

**After:**

```typescript
const addFavorite = useCallback(async (station: NDKStation) => {
  const added = await targetList.addStationAndPublish(stationAddress);
  if (added) {
    setFavoritesLists(prev => /* update state */);
  }
  return added;
}, [favoritesLists, defaultList]);
```

## Architecture Principles

### 1. **Entity Encapsulation**

Entities (NDKStation, NDKWFFavorites) own their business logic and know how to persist themselves.

### 2. **Cache Invalidation at Source**

Cache invalidation happens in the entity class, not scattered across hooks.

### 3. **Atomic Operations**

Each `*AndPublish` method is an atomic operation that ensures consistency.

### 4. **Hook as Coordinator**

React hooks coordinate between entities and UI state, but don't contain business logic.

### 5. **Testability**

Entity methods can be tested without React:

```typescript
// Pure unit test - no React needed
test("addStationAndPublish adds and publishes", async () => {
  const favorites = new NDKWFFavorites(ndk);
  const result = await favorites.addStationAndPublish(stationAddress);
  expect(result).toBe(true);
  expect(favorites.hasStation(stationAddress)).toBe(true);
});
```

## Usage Examples

### Adding a Favorite

```typescript
// In a component
const { favoritesLists, defaultList } = useFavorites();

const handleAddFavorite = async (station: NDKStation) => {
  // Class handles all the complexity
  const added = await defaultList.addStationAndPublish(
    `31237:${station.pubkey}:${station.stationId}`
  );

  if (added) {
    toast.success("Added to favorites!");
  } else {
    toast.info("Already in favorites");
  }
};
```

### Outside React (e.g., CLI tool, background job)

```typescript
// No hooks needed!
const ndk = new NDK({ explicitRelayUrls: [...] });
await ndk.connect();

const favorites = NDKWFFavorites.createDefault(ndk);
favorites.pubkey = userPubkey;

await favorites.addStationAndPublish('31237:...:...');
// Done! Published and cached properly
```

## Comparison with Other Patterns

### Active Record (Ruby on Rails)

```ruby
station = Station.new(name: "Jazz FM")
station.save  # Persist to database
```

### Our Pattern

```typescript
const favorites = NDKWFFavorites.createDefault(ndk);
await favorites.addStationAndPublish(address); // Persist to Nostr
```

### Repository Pattern (Alternative)

```typescript
// We could have done this, but it adds complexity:
const favoritesRepo = new FavoritesRepository(ndk);
await favoritesRepo.add(favorites, stationAddress);
```

Our approach is simpler for this use case since NDK events already have `sign()` and `publish()` methods.

## Migration Guide

If you have existing code using the old pattern:

### Old Way

```typescript
list.addStation(address);
if (ndk?.cacheAdapter?.deleteEventIds && list.id) {
  await ndk.cacheAdapter.deleteEventIds([list.id]);
}
await list.sign();
await list.publish();
```

### New Way

```typescript
await list.addStationAndPublish(address);
```

That's it! 🎉

## Future Improvements

1. **Transaction Support**: Could add rollback capability
2. **Batch Operations**: `addMultipleStationsAndPublish(addresses[])`
3. **Optimistic Updates**: Return before publish completes
4. **Event Sourcing**: Track all mutations for audit trail
5. **Validation Middleware**: Hook into mutations for custom validation

## Related Files

- `src/lib/NDKWFFavorites.ts` - Favorites entity with mutation methods
- `src/lib/NDKStation.ts` - Station entity with mutation methods
- `src/lib/hooks/useFavorites.ts` - Simplified React hook
- `src/lib/hooks/useStations.ts` - Station subscription hook
- `CACHE_INVALIDATION_SOLUTION.md` - Cache strategy documentation
