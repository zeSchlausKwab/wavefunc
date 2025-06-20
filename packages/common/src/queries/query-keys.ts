/**
 * Centralized query keys factory for TanStack Query
 *
 * This provides a structured approach to query key management with:
 * - Type safety for query keys
 * - Consistent naming conventions
 * - Easy cache invalidation
 * - Query key relationships
 */

export const queryKeys = {
    // Station-related queries
    stations: {
        all: ['stations'] as const,
        lists: () => [...queryKeys.stations.all, 'list'] as const,
        list: (filters: Record<string, any> = {}) => [...queryKeys.stations.lists(), filters] as const,
        details: () => [...queryKeys.stations.all, 'detail'] as const,
        detail: (naddr: string) => [...queryKeys.stations.details(), naddr] as const,
        search: (searchTerm: string, filters: Record<string, any> = {}) =>
            [...queryKeys.stations.all, 'search', searchTerm, filters] as const,
        featured: () => [...queryKeys.stations.all, 'featured'] as const,
        byOwner: (pubkey: string) => [...queryKeys.stations.all, 'owner', pubkey] as const,
        infinite: (filters: Record<string, any> = {}) => [...queryKeys.stations.lists(), 'infinite', filters] as const,
    },

    // Profile-related queries
    profiles: {
        all: ['profiles'] as const,
        lists: () => [...queryKeys.profiles.all, 'list'] as const,
        list: (pubkeys: string[]) => [...queryKeys.profiles.lists(), pubkeys.sort()] as const,
        details: () => [...queryKeys.profiles.all, 'detail'] as const,
        detail: (pubkey: string) => [...queryKeys.profiles.details(), pubkey] as const,
        metadata: (pubkey: string) => [...queryKeys.profiles.detail(pubkey), 'metadata'] as const,
        relays: (pubkey: string) => [...queryKeys.profiles.detail(pubkey), 'relays'] as const,
    },

    // Favorites and lists
    favorites: {
        all: ['favorites'] as const,
        lists: () => [...queryKeys.favorites.all, 'list'] as const,
        byUser: (pubkey: string) => [...queryKeys.favorites.lists(), pubkey] as const,
        list: (listId: string) => [...queryKeys.favorites.all, 'detail', listId] as const,
        stations: (listId: string) => [...queryKeys.favorites.list(listId), 'stations'] as const,
    },

    // Comments and reactions
    comments: {
        all: ['comments'] as const,
        byEvent: (eventId: string) => [...queryKeys.comments.all, 'event', eventId] as const,
        byStation: (naddr: string) => [...queryKeys.comments.all, 'station', naddr] as const,
        thread: (rootId: string) => [...queryKeys.comments.all, 'thread', rootId] as const,
    },

    reactions: {
        all: ['reactions'] as const,
        byEvent: (eventId: string) => [...queryKeys.reactions.all, 'event', eventId] as const,
        byStation: (naddr: string) => [...queryKeys.reactions.all, 'station', naddr] as const,
        summary: (eventId: string) => [...queryKeys.reactions.byEvent(eventId), 'summary'] as const,
    },

    // DVMCP/Music recognition
    dvmcp: {
        all: ['dvmcp'] as const,
        providers: () => [...queryKeys.dvmcp.all, 'providers'] as const,
        search: (query: string, type: string) => [...queryKeys.dvmcp.all, 'search', type, query] as const,
        lookup: (id: string, type: string) => [...queryKeys.dvmcp.all, 'lookup', type, id] as const,
        history: () => [...queryKeys.dvmcp.all, 'history'] as const,
    },

    // Radio browser API
    radioBrowser: {
        all: ['radioBrowser'] as const,
        search: (filters: Record<string, any>) => [...queryKeys.radioBrowser.all, 'search', filters] as const,
        topVote: (limit: number) => [...queryKeys.radioBrowser.all, 'topVote', limit] as const,
        topClick: (limit: number) => [...queryKeys.radioBrowser.all, 'topClick', limit] as const,
        byUuid: (uuid: string) => [...queryKeys.radioBrowser.all, 'uuid', uuid] as const,
        countries: () => [...queryKeys.radioBrowser.all, 'countries'] as const,
        languages: () => [...queryKeys.radioBrowser.all, 'languages'] as const,
        tags: () => [...queryKeys.radioBrowser.all, 'tags'] as const,
    },
} as const

// Type helpers for query keys
export type StationQueryKey = 
    | readonly ['stations']
    | readonly ['stations', 'list']
    | readonly ['stations', 'list', Record<string, any>]
    | readonly ['stations', 'detail']
    | readonly ['stations', 'detail', string]
    | readonly ['stations', 'search', string, Record<string, any>]
    | readonly ['stations', 'infinite', Record<string, any>]
    | readonly ['stations', 'featured']
    | readonly ['stations', 'byOwner', string]

export type ProfileQueryKey =
    | readonly ['profiles']
    | readonly ['profiles', 'list']
    | readonly ['profiles', 'list', string[]]
    | readonly ['profiles', 'detail']
    | readonly ['profiles', 'detail', string]

export type FavoritesQueryKey =
    | readonly ['favorites']
    | readonly ['favorites', 'list']
    | readonly ['favorites', 'list', string]
    | readonly ['favorites', 'detail', string]
    | readonly ['favorites', 'stations', string]

export type CommentsQueryKey =
    | readonly ['comments']
    | readonly ['comments', 'event', string]
    | readonly ['comments', 'station', string]
    | readonly ['comments', 'thread', string]

export type ReactionsQueryKey =
    | readonly ['reactions']
    | readonly ['reactions', 'event', string]
    | readonly ['reactions', 'station', string]
    | readonly ['reactions', 'event', string, 'summary']

export type DVMCPQueryKey =
    | readonly ['dvmcp']
    | readonly ['dvmcp', 'providers']
    | readonly ['dvmcp', 'search', string, string]
    | readonly ['dvmcp', 'lookup', string, string]
    | readonly ['dvmcp', 'realtime']

export type RadioBrowserQueryKey =
    | readonly ['radioBrowser']
    | readonly ['radioBrowser', 'search', Record<string, any>]
    | readonly ['radioBrowser', 'topVote', number]
    | readonly ['radioBrowser', 'topClick', number]
    | readonly ['radioBrowser', 'countries']
    | readonly ['radioBrowser', 'languages']
    | readonly ['radioBrowser', 'tags']

// Union of all query keys
export type QueryKey =
    | StationQueryKey
    | ProfileQueryKey
    | FavoritesQueryKey
    | CommentsQueryKey
    | ReactionsQueryKey
    | DVMCPQueryKey
    | RadioBrowserQueryKey
