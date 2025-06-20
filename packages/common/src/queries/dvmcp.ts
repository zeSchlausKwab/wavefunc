import {
    useQuery,
    useMutation,
    useQueryClient,
    type UseQueryOptions,
    type UseMutationOptions,
} from '@tanstack/react-query'
import { queryKeys } from './query-keys'
import { withNDKDependency, withQueryErrorHandling } from './query-client'
import { ndkActions } from '../lib/store/ndk'
import { createDVMCPService, getDVMCPService } from '../services/dvmcp'
import type { SearchResult, SearchType, ToolResult } from '../components/library/types'

/**
 * Hook to discover and cache DVMCP providers
 */
export function useDVMCPProviders(options?: Partial<UseQueryOptions<any[]>>) {
    return useQuery({
        queryKey: queryKeys.dvmcp.providers(),
        ...withNDKDependency(async () => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()!

                // Get or create DVMCP service
                let dvmcpService = getDVMCPService()
                if (!dvmcpService) {
                    dvmcpService = createDVMCPService(ndk)
                }

                // Discover providers
                await dvmcpService.discoverProviders(10000) // 10 second timeout

                // Return basic provider info (since we don't have a getter method)
                return [{ identifier: 'wavefunc-dvmcp-bridge', available: true }]
            }, 'discoverDVMCPProviders')
        }),
        staleTime: 10 * 60 * 1000, // 10 minutes - providers don't change often
        gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
        retry: 2, // Retry discovery failures
        ...options,
    })
}

/**
 * Hook for DVMCP music search with caching
 */
export function useDVMCPSearch(
    searchType: SearchType,
    query: string,
    searchOptions: Record<string, any> = {},
    options?: Partial<UseQueryOptions<SearchResult[]>>,
) {
    return useQuery({
        queryKey: queryKeys.dvmcp.search(query, searchType),
        ...withNDKDependency(async () => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()!

                let dvmcpService = getDVMCPService()
                if (!dvmcpService) {
                    dvmcpService = createDVMCPService(ndk)
                }

                // Build tool name and arguments
                const toolName = getToolName(searchType)
                const args = buildSearchArgs(searchType, {
                    artist: query,
                    title: searchOptions.title || '',
                    ...searchOptions,
                })

                // Call DVMCP tool
                const result = await dvmcpService.callTool(toolName, args)

                if (!result) {
                    return []
                }

                // Extract and return search results
                return extractSearchResults(result, searchType)
            }, `dvmcpSearch(${searchType}, ${query})`)
        }),
        enabled: !!query.trim() && query.length >= 2 && !!ndkActions.getNDK(),
        staleTime: 5 * 60 * 1000, // 5 minutes for search results
        retry: 1, // Only retry once for search failures
        ...options,
    })
}

/**
 * Hook for DVMCP lookup by ID with caching
 */
export function useDVMCPLookup(
    searchType: SearchType,
    id: string,
    options?: Partial<UseQueryOptions<SearchResult | null>>,
) {
    return useQuery({
        queryKey: queryKeys.dvmcp.lookup(id, searchType),
        ...withNDKDependency(async () => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()!

                let dvmcpService = getDVMCPService()
                if (!dvmcpService) {
                    dvmcpService = createDVMCPService(ndk)
                }

                // Build tool name and arguments for lookup
                const toolName = getLookupToolName(searchType)
                const args = buildLookupArgs(searchType, id)

                // Call DVMCP tool
                const result = await dvmcpService.callTool(toolName, args)

                return result || null
            }, `dvmcpLookup(${searchType}, ${id})`)
        }),
        enabled: !!id.trim() && !!ndkActions.getNDK(),
        staleTime: 15 * 60 * 1000, // 15 minutes for lookup results (more stable)
        ...options,
    })
}

/**
 * Hook to fetch DVMCP tool usage history
 */
export function useDVMCPHistory(options?: Partial<UseQueryOptions<ToolResult[]>>) {
    return useQuery({
        queryKey: queryKeys.dvmcp.history(),
        queryFn: () => {
            // Get history from local storage or state
            const history = localStorage.getItem('dvmcp-history')
            return history ? JSON.parse(history) : []
        },
        staleTime: 0, // Always fresh from local storage
        ...options,
    })
}

/**
 * Mutation hook for DVMCP tool calls with history tracking
 */
export function useDVMCPToolCall(
    options?: Partial<UseMutationOptions<any, Error, { toolName: string; args: Record<string, any> }>>,
) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ toolName, args }: { toolName: string; args: Record<string, any> }) => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()
                if (!ndk) {
                    throw new Error('NDK not available')
                }

                let dvmcpService = getDVMCPService()
                if (!dvmcpService) {
                    dvmcpService = createDVMCPService(ndk)
                }

                const result = await dvmcpService.callTool(toolName, args)

                // Create tool result for history
                const toolResult: ToolResult = {
                    tool: toolName,
                    data: result,
                    timestamp: Date.now(),
                    cost: getToolCost(toolName),
                }

                // Update history in local storage
                const currentHistory = JSON.parse(localStorage.getItem('dvmcp-history') || '[]')
                const newHistory = [toolResult, ...currentHistory.slice(0, 9)] // Keep last 10
                localStorage.setItem('dvmcp-history', JSON.stringify(newHistory))

                return result
            }, `dvmcpToolCall(${toolName})`)
        },

        onSuccess: (data, { toolName, args }) => {
            // Invalidate history query to show new entry
            queryClient.invalidateQueries({ queryKey: queryKeys.dvmcp.history() })

            // Update related search/lookup caches if applicable
            if (toolName.includes('search')) {
                // Extract search term from args to invalidate specific search
                const searchTerm = args.artist || args.query || ''
                if (searchTerm) {
                    const searchType = getSearchTypeFromToolName(toolName)
                    queryClient.setQueryData(
                        queryKeys.dvmcp.search(searchTerm, searchType),
                        extractSearchResults(data, searchType),
                    )
                }
            } else if (toolName.includes('lookup')) {
                // Extract ID and type for lookup cache
                const id = args.id || args.mbid || args.discogs_id || ''
                if (id) {
                    const searchType = getSearchTypeFromToolName(toolName)
                    queryClient.setQueryData(queryKeys.dvmcp.lookup(id, searchType), data)
                }
            }
        },

        ...options,
    })
}

/**
 * Helper functions (these would typically be imported from utils)
 */
function getToolName(searchType: SearchType): string {
    switch (searchType) {
        case 'discogs':
            return 'discogs-search'
        case 'recording':
            return 'musicbrainz-search-recording'
        case 'artist':
            return 'musicbrainz-search-artist'
        case 'label':
            return 'musicbrainz-search-label'
        default:
            return 'musicbrainz-search-release'
    }
}

function getLookupToolName(searchType: SearchType): string {
    switch (searchType) {
        case 'discogs':
            return 'discogs-lookup'
        case 'recording':
            return 'musicbrainz-lookup-recording'
        case 'artist':
            return 'musicbrainz-lookup-artist'
        case 'label':
            return 'musicbrainz-lookup-label'
        default:
            return 'musicbrainz-lookup-release'
    }
}

function getSearchTypeFromToolName(toolName: string): SearchType {
    if (toolName.includes('discogs')) return 'discogs'
    if (toolName.includes('recording')) return 'recording'
    if (toolName.includes('artist')) return 'artist'
    if (toolName.includes('label')) return 'label'
    return 'release'
}

function buildSearchArgs(searchType: SearchType, formData: any): Record<string, any> {
    const baseArgs = {
        artist: formData.artist || '',
        title: formData.title || '',
        limit: parseInt(formData.limit || '10'),
    }

    if (searchType === 'discogs') {
        return {
            ...baseArgs,
            type: formData.type || 'release',
            per_page: parseInt(formData.per_page || '10'),
            page: parseInt(formData.page || '1'),
        }
    } else {
        return {
            ...baseArgs,
            offset: parseInt(formData.offset || '0'),
        }
    }
}

function buildLookupArgs(searchType: SearchType, id: string): Record<string, any> {
    if (searchType === 'discogs') {
        return { discogs_id: id }
    } else {
        return { mbid: id }
    }
}

function extractSearchResults(data: any, searchType: SearchType): SearchResult[] {
    if (!data) return []

    try {
        if (searchType === 'discogs') {
            return data.results || []
        } else {
            // MusicBrainz results
            const key = `${searchType}s` // recordings, releases, artists, labels
            return data[key] || []
        }
    } catch (error) {
        console.error('Error extracting search results:', error)
        return []
    }
}

function getToolCost(toolName: string): string {
    // Tool costs are determined by the DVMCP server configuration
    return 'Variable'
}

/**
 * Query options factory for DVMCP queries
 */
export const dvmcpQueries = {
    // Provider discovery
    providers: () => ({
        queryKey: queryKeys.dvmcp.providers(),
        ...withNDKDependency(async () => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()!

                let dvmcpService = getDVMCPService()
                if (!dvmcpService) {
                    dvmcpService = createDVMCPService(ndk)
                }

                await dvmcpService.discoverProviders(10000)
                return [{ identifier: 'wavefunc-dvmcp-bridge', available: true }]
            }, 'discoverDVMCPProviders')
        }),
        staleTime: 10 * 60 * 1000,
    }),

    // Search query options
    search: (searchType: SearchType, query: string, searchOptions: Record<string, any> = {}) => ({
        queryKey: queryKeys.dvmcp.search(query, searchType),
        ...withNDKDependency(async () => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()!

                let dvmcpService = getDVMCPService()
                if (!dvmcpService) {
                    dvmcpService = createDVMCPService(ndk)
                }

                const toolName = getToolName(searchType)
                const args = buildSearchArgs(searchType, {
                    artist: query,
                    title: searchOptions.title || '',
                    ...searchOptions,
                })

                const result = await dvmcpService.callTool(toolName, args)
                return result ? extractSearchResults(result, searchType) : []
            }, `dvmcpSearch(${searchType}, ${query})`)
        }),
        enabled: !!query.trim() && query.length >= 2 && !!ndkActions.getNDK(),
        staleTime: 5 * 60 * 1000,
    }),

    // Lookup query options
    lookup: (searchType: SearchType, id: string) => ({
        queryKey: queryKeys.dvmcp.lookup(id, searchType),
        ...withNDKDependency(async () => {
            return withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()!

                let dvmcpService = getDVMCPService()
                if (!dvmcpService) {
                    dvmcpService = createDVMCPService(ndk)
                }

                const toolName = getLookupToolName(searchType)
                const args = buildLookupArgs(searchType, id)

                return await dvmcpService.callTool(toolName, args)
            }, `dvmcpLookup(${searchType}, ${id})`)
        }),
        enabled: !!id.trim() && !!ndkActions.getNDK(),
        staleTime: 15 * 60 * 1000,
    }),
} as const
