# TanStack Query Integration for Wavefunc

This directory contains the complete TanStack Query integration for Wavefunc, providing powerful data fetching, caching, and synchronization capabilities optimized for nostr-based applications.

## Overview

The query system is designed to:

- **Reduce API calls** through intelligent caching
- **Improve performance** with background updates and optimistic mutations
- **Provide real-time updates** via nostr subscription integration
- **Enhance UX** with consistent loading states and error handling
- **Simplify state management** by replacing manual subscription handling

## Architecture

### Core Files

- **`query-keys.ts`** - Centralized query key factory with type safety
- **`query-client.ts`** - QueryClient configuration optimized for nostr
- **`real-time.ts`** - Real-time subscription integration with cache invalidation

### Data Modules

- **`stations.ts`** - Radio station queries (search, fetch, infinite scroll)
- **`profiles.ts`** - User profile queries and metadata
- **`favorites.ts`** - Favorites list management with optimistic updates
- **`comments.ts`** - Comment system with real-time updates
- **`mutations.ts`** - Station publishing/updating with optimistic UX
- **`dvmcp.ts`** - Music recognition and metadata queries

## Usage Examples

### Basic Station Fetching

```tsx
import { useStation, useStations } from '@wavefunc/common'

function StationPage({ naddr }: { naddr: string }) {
    const { data: station, isLoading, error } = useStation(naddr)

    if (isLoading) return <div>Loading...</div>
    if (error) return <div>Error: {error.message}</div>
    if (!station) return <div>Station not found</div>

    return <StationCard station={station} />
}

function StationsList() {
    const { data: stations, isLoading, refetch } = useStations({ limit: 20 })

    return <div>{stations?.map((station) => <StationCard key={station.naddr} station={station} />)}</div>
}
```

### Infinite Scroll

```tsx
import { useInfiniteStations } from '@wavefunc/common'

function InfiniteStationsList() {
    const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteStations({ limit: 20 })

    return (
        <div>
            {data?.pages.map((page, i) => (
                <div key={i}>
                    {page.map((station) => (
                        <StationCard key={station.naddr} station={station} />
                    ))}
                </div>
            ))}

            {hasNextPage && (
                <button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                    {isFetchingNextPage ? 'Loading...' : 'Load More'}
                </button>
            )}
        </div>
    )
}
```

### Search with Debouncing

```tsx
import { useStationSearch } from '@wavefunc/common'
import { useState, useDeferredValue } from 'react'

function StationSearch() {
    const [searchTerm, setSearchTerm] = useState('')
    const deferredSearchTerm = useDeferredValue(searchTerm)

    const { data: results, isLoading } = useStationSearch(deferredSearchTerm, { limit: 10 })

    return (
        <div>
            <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search stations..."
            />

            {isLoading && <div>Searching...</div>}

            {results?.map((station) => <StationCard key={station.naddr} station={station} />)}
        </div>
    )
}
```

### Optimistic Mutations

```tsx
import { usePublishStation } from '@wavefunc/common'

function CreateStationForm() {
    const publishStation = usePublishStation({
        onSuccess: (newStation) => {
            toast.success(`Station "${newStation.title}" published!`)
        },
        onError: (error) => {
            toast.error(`Failed to publish: ${error.message}`)
        },
    })

    const handleSubmit = (formData: any) => {
        publishStation.mutate({
            title: formData.title,
            description: formData.description,
            streamUrl: formData.streamUrl,
            // ... other fields
        })
    }

    return (
        <form onSubmit={handleSubmit}>
            {/* Form fields */}
            <button type="submit" disabled={publishStation.isPending}>
                {publishStation.isPending ? 'Publishing...' : 'Publish Station'}
            </button>
        </form>
    )
}
```

### Real-time Updates

```tsx
import { useRealtimeSync } from '@wavefunc/common'

function App() {
    // Enable real-time synchronization across all queries
    useRealtimeSync()

    return <YourAppContent />
}

// Or enable specific real-time features
function StationsPage() {
    useRealtimeStations() // Only station updates
    useRealtimeComments() // Only comment updates

    return <StationsList />
}
```

### DVMCP Music Recognition

```tsx
import { useDVMCPSearch, useDVMCPProviders } from '@wavefunc/common'

function MusicSearch() {
    const { data: providers } = useDVMCPProviders()
    const [searchTerm, setSearchTerm] = useState('')

    const { data: results, isLoading } = useDVMCPSearch('recording', searchTerm, { limit: 10 })

    return (
        <div>
            <div>Providers available: {providers?.length || 0}</div>

            <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search for music..."
            />

            {isLoading && <div>Searching...</div>}

            {results?.map((result) => <MusicResultCard key={result.id} result={result} />)}
        </div>
    )
}
```

## Setup

### 1. Initialize Query Client

```tsx
// In your app initialization
import { initializeQueryClient } from '@wavefunc/common'

// During app startup
const queryClient = initializeQueryClient()
```

### 2. Provider Setup

```tsx
import { QueryClientProvider } from '@tanstack/react-query'
import { getQueryClient, useRealtimeSync } from '@wavefunc/common'

function App() {
    const queryClient = getQueryClient()

    return (
        <QueryClientProvider client={queryClient}>
            <AppContent />
        </QueryClientProvider>
    )
}

function AppContent() {
    // Enable real-time synchronization
    useRealtimeSync()

    return <YourAppRoutes />
}
```

### 3. DevTools (Development)

```tsx
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

function App() {
    return (
        <>
            <YourApp />
            {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
        </>
    )
}
```

## Query Key Structure

Query keys follow a hierarchical structure for easy invalidation:

```typescript
// Station queries
;['stations'][('stations', 'list')][('stations', 'list', filters)][('stations', 'detail', naddr)][ // All station data // Station lists // Filtered station lists // Individual station
    ('stations', 'search', searchTerm, filters)
][ // Search results
    // Profile queries
    ('profiles', 'detail', pubkey)
][('profiles', 'list', pubkeys)][ // Individual profile // Multiple profiles
    // Favorites queries
    ('favorites', 'byUser', pubkey)
][('favorites', 'detail', listId)][('favorites', 'detail', listId, 'stations')] // User's favorites lists // Specific favorites list // Stations in favorites list
```

## Performance Benefits

### Before (Manual Subscriptions)

- ❌ Duplicate network requests
- ❌ Manual state management
- ❌ Complex loading states
- ❌ Manual error handling
- ❌ Memory leaks from forgotten cleanup

### After (TanStack Query)

- ✅ Automatic request deduplication
- ✅ Intelligent background refetching
- ✅ Built-in loading/error states
- ✅ Optimistic updates
- ✅ Automatic cleanup and garbage collection
- ✅ DevTools for debugging
- ✅ Real-time cache invalidation

## Migration Guide

### From Direct NDK Calls

```tsx
// Before
const [stations, setStations] = useState<Station[]>([])
const [loading, setLoading] = useState(false)

useEffect(() => {
    const fetchStations = async () => {
        setLoading(true)
        try {
            const ndk = ndkActions.getNDK()
            const result = await fetchRadioStations(ndk, { limit: 20 })
            setStations(result)
        } catch (error) {
            console.error('Failed to fetch stations:', error)
        } finally {
            setLoading(false)
        }
    }

    fetchStations()
}, [])

// After
const { data: stations, isLoading } = useStations({ limit: 20 })
```

### From Manual Subscriptions

```tsx
// Before
useEffect(() => {
    const ndk = ndkActions.getNDK()
    if (!ndk) return

    const sub = subscribeToRadioStations(ndk, (station) => {
        setStations((prev) => updateStationInList(prev, station))
    })

    return () => sub.stop()
}, [])

// After
useRealtimeStations() // Automatic cache updates
const { data: stations } = useStations()
```

## Best Practices

### 1. Use Query Keys Consistently

```tsx
// Good - use the factory
const queryKey = queryKeys.stations.detail(naddr)

// Bad - manual key construction
const queryKey = ['stations', 'detail', naddr]
```

### 2. Handle Loading and Error States

```tsx
function StationComponent({ naddr }: { naddr: string }) {
    const { data: station, isLoading, error } = useStation(naddr)

    if (isLoading) return <StationSkeleton />
    if (error) return <ErrorMessage error={error} />
    if (!station) return <NotFound />

    return <StationCard station={station} />
}
```

### 3. Use Optimistic Updates for Better UX

```tsx
const publishStation = usePublishStation({
    onMutate: () => {
        // Show immediate feedback
        toast.info('Publishing station...')
    },
    onSuccess: () => {
        toast.success('Station published!')
    },
    onError: (error) => {
        toast.error(`Failed: ${error.message}`)
    },
})
```

### 4. Leverage Real-time Updates

```tsx
// Enable at app level for global sync
function App() {
    useRealtimeSync()
    return <AppContent />
}

// Or enable specific features where needed
function CommentsSection() {
    useRealtimeComments()
    return <CommentsList />
}
```

## Troubleshooting

### Common Issues

1. **"NDK not available" errors**: Ensure NDK is initialized before using queries
2. **Stale data**: Check `staleTime` configuration in query options
3. **Too many requests**: Verify query keys are stable and not changing unnecessarily
4. **Memory leaks**: Make sure real-time hooks are only used once per app section

### Debug Tools

- Use React Query DevTools to inspect cache state
- Check browser network tab for request patterns
- Monitor console for subscription lifecycle logs
- Use `queryClient.getQueryCache()` to inspect cache programmatically

## Future Enhancements

- [ ] Offline support with cache persistence
- [ ] Background sync for improved reliability
- [ ] Query optimization based on usage patterns
- [ ] Advanced error recovery strategies
- [ ] Integration with service workers for better caching
