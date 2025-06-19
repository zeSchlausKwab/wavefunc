'use client'

import { useState } from 'react'
import { Button } from '@wavefunc/ui/components/ui/button'
import { Input } from '@wavefunc/ui/components/ui/input'
import { Search, Loader2, Music, ExternalLink } from 'lucide-react'
import { cn } from '@wavefunc/common'
import { ndkActions } from '../lib/store/ndk'
import { NDKEvent } from '@nostr-dev-kit/ndk'

interface DiscogsSearchResult {
    id: number
    title: string
    artist?: string
    year?: string
    label?: string[]
    genre?: string[]
    thumb?: string
    resource_url?: string
    master_url?: string
    uri?: string
    type?: string
}

interface DiscogsResponse {
    type: 'discogs_search_result'
    data: {
        results: DiscogsSearchResult[]
        pagination: {
            items: number
            page: number
            pages: number
            per_page: number
        }
    }
}

export function DiscogsMusicSearch() {
    const [artist, setArtist] = useState('')
    const [title, setTitle] = useState('')
    const [isSearching, setIsSearching] = useState(false)
    const [results, setResults] = useState<DiscogsSearchResult[]>([])
    const [error, setError] = useState<string | null>(null)

    const discoverDiscogsProviders = async (ndk: any): Promise<{ pubkey: string; serverIdentifier: string } | null> => {
        console.log('[DiscogsMusicSearch] Discovering Discogs search providers...')

        try {
            // Fetch server announcements and tools lists
            const events = await ndk.fetchEvents({
                kinds: [31316, 31317], // SERVER_ANNOUNCEMENT_KIND, TOOLS_LIST_KIND
                '#k': ['25910'], // Updated to new kind
                limit: 20,
            })

            const servers: { pubkey: string; serverIdentifier: string }[] = []

            for (const event of Array.from(events) as NDKEvent[]) {
                try {
                    const content = JSON.parse(event.content)
                    let hasDiscogsSearch = false
                    let serverIdentifier = ''

                    if (event.kind === 31316) {
                        // Server announcement
                        const serverInfo = content.serverInfo

                        // Look for music/discogs capability
                        hasDiscogsSearch =
                            serverInfo?.name?.toLowerCase().includes('music') ||
                            content.about?.toLowerCase().includes('music') ||
                            event.tags.some((tag: any) => tag[0] === 'about' && tag[1]?.toLowerCase().includes('music'))

                        const serverTag = event.tags.find((tag: any) => tag[0] === 'd')
                        serverIdentifier = serverTag?.[1] || ''
                    } else if (event.kind === 31317) {
                        // Tools list - this is the most reliable check
                        const tools = content.tools || []
                        hasDiscogsSearch = tools.some((tool: any) => tool.name === 'discogs-search')

                        const serverTag = event.tags.find((tag: any) => tag[0] === 's')
                        serverIdentifier = serverTag?.[1] || ''

                        if (hasDiscogsSearch) {
                            console.log(`[DiscogsMusicSearch] Found discogs-search tool in server: ${serverIdentifier}`)
                        }
                    }

                    if (hasDiscogsSearch && serverIdentifier) {
                        const existing = servers.find(
                            (s) => s.pubkey === event.pubkey && s.serverIdentifier === serverIdentifier,
                        )
                        if (!existing) {
                            console.log(
                                `[DiscogsMusicSearch] Found Discogs provider: ${serverIdentifier} (${event.pubkey})`,
                            )
                            servers.push({
                                pubkey: event.pubkey,
                                serverIdentifier,
                            })
                        }
                    }
                } catch (error) {
                    console.warn('[DiscogsMusicSearch] Failed to parse server event:', error)
                }
            }

            if (servers.length > 0) {
                console.log(`[DiscogsMusicSearch] Found ${servers.length} Discogs providers, using first one`)
                return servers[0]
            } else {
                console.log('[DiscogsMusicSearch] No providers found, using fallback')
                return {
                    pubkey: 'f47121cd783802e6d4879e63233b54aff54e6788ea9ef568cec0259cc60fe286',
                    serverIdentifier: 'wavefunc-dvmcp-bridge',
                }
            }
        } catch (error) {
            console.error('[DiscogsMusicSearch] Error discovering providers:', error)
            return {
                pubkey: 'f47121cd783802e6d4879e63233b54aff54e6788ea9ef568cec0259cc60fe286',
                serverIdentifier: 'wavefunc-dvmcp-bridge',
            }
        }
    }

    const handleSearch = async () => {
        if (!title.trim()) {
            setError('Please enter both artist and title')
            return
        }

        setIsSearching(true)
        setError(null)
        setResults([])

        try {
            // Use DVMCP service to call the discogs-search tool
            const ndk = ndkActions.getNDK()
            if (!ndk || !ndk.activeUser) {
                throw new Error('NDK or user not available')
            }

            console.log('Discovering and calling discogs-search tool via DVMCP...')

            // Discover providers that support discogs-search
            const provider = await discoverDiscogsProviders(ndk)
            if (!provider) {
                throw new Error('No Discogs search providers found')
            }

            const { pubkey: providerPubkey, serverIdentifier } = provider
            console.log(`Using provider: ${serverIdentifier} (${providerPubkey})`)

            // Create the DVMCP request event
            const requestEvent = new NDKEvent(ndk)
            requestEvent.kind = 25910 // JOB_KIND
            requestEvent.content = JSON.stringify({
                method: 'tools/call',
                params: {
                    name: 'discogs-search',
                    arguments: {
                        artist: artist.trim(),
                        title: title.trim(),
                        type: 'release',
                        per_page: '10',
                    },
                },
            })
            requestEvent.tags = [
                ['method', 'tools/call'],
                ['p', providerPubkey],
                ['s', serverIdentifier],
            ]

            await requestEvent.sign()

            console.log('DVMCP request:', requestEvent)

            // Subscribe to responses
            const sub = ndk.subscribe({
                kinds: [26910 as any], // RESULT_KIND
                '#e': [requestEvent.id],
                limit: 1,
            })

            const response: any = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    sub.stop()
                    reject(new Error('DVMCP request timed out'))
                }, 15000)

                sub.on('event', (event) => {
                    try {
                        const content = JSON.parse(event.content)

                        if (content.error) {
                            clearTimeout(timeout)
                            sub.stop()
                            reject(new Error(content.error.message || 'DVMCP protocol error'))
                            return
                        }

                        if (content.content && Array.isArray(content.content)) {
                            const toolResult = content.content[0]
                            if (toolResult?.text) {
                                const result = JSON.parse(toolResult.text)
                                clearTimeout(timeout)
                                sub.stop()
                                resolve(result)
                            }
                        }
                    } catch (error) {
                        clearTimeout(timeout)
                        sub.stop()
                        reject(error)
                    }
                })

                // Publish the request after setting up the subscription
                requestEvent.publish().then(() => {
                    console.log('DVMCP request published:', requestEvent.id)
                })
            })

            console.log('DVMCP Discogs search response:', response)

            if (response && response.data && response.data.results) {
                setResults(response.data.results)
            } else if (response && response.results) {
                // Handle direct results format
                setResults(response.results)
            } else {
                setError('No results found')
            }
        } catch (err) {
            console.error('Discogs search error:', err)
            setError(err instanceof Error ? err.message : 'Search failed')
        } finally {
            setIsSearching(false)
        }
    }

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !isSearching) {
            handleSearch()
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <Music className="h-5 w-5 text-blue-600" />
                <span className="font-semibold text-sm">Discogs Music Search</span>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
                <Input
                    placeholder="Artist name..."
                    value={artist}
                    onChange={(e) => setArtist(e.target.value)}
                    onKeyPress={handleKeyPress}
                    disabled={isSearching}
                    className="flex-1"
                />
                <Input
                    placeholder="Song/Album title..."
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onKeyPress={handleKeyPress}
                    disabled={isSearching}
                    className="flex-1"
                />
                <Button
                    onClick={handleSearch}
                    disabled={isSearching || !title.trim()}
                    className={cn(
                        'border-2 border-black',
                        'shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]',
                        'transition-transform hover:translate-y-[-2px]',
                        'bg-blue-500 hover:bg-blue-600 text-white',
                    )}
                >
                    {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
            </div>

            {error && <div className="text-sm text-red-600 bg-red-50 p-2 rounded border border-red-200">{error}</div>}

            {results.length > 0 && (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                    <div className="text-sm font-medium text-gray-700">Found {results.length} results:</div>
                    {results.map((result) => (
                        <div
                            key={result.id}
                            className={cn(
                                'p-3 bg-white border-2 border-black rounded',
                                'shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]',
                                'hover:translate-y-[-2px] transition-transform cursor-pointer',
                            )}
                            onClick={() => {
                                if (result.uri) {
                                    window.open(`https://www.discogs.com${result.uri}`, '_blank')
                                }
                            }}
                        >
                            <div className="flex items-start gap-3">
                                {result.thumb && (
                                    <img
                                        src={result.thumb}
                                        alt={result.title}
                                        className="w-12 h-12 object-cover rounded border"
                                    />
                                )}
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-sm truncate">{result.title}</div>
                                    {result.artist && (
                                        <div className="text-xs text-gray-600 truncate">by {result.artist}</div>
                                    )}
                                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                                        {result.year && <span>{result.year}</span>}
                                        {result.label && result.label.length > 0 && <span>• {result.label[0]}</span>}
                                        {result.genre && result.genre.length > 0 && <span>• {result.genre[0]}</span>}
                                    </div>
                                </div>
                                <ExternalLink className="h-4 w-4 text-gray-400" />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
