'use client'

import { useState } from 'react'
import { Button } from '@wavefunc/ui/components/ui/button'
import { Input } from '@wavefunc/ui/components/ui/input'
import { Search, Loader2, Music, ExternalLink } from 'lucide-react'
import { cn } from '@wavefunc/common'
import { useDVMCPProviders, useDVMCPSearch } from '../queries'
import { useDebounce } from 'react-use'

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

export function DiscogsMusicSearch() {
    const [artist, setArtist] = useState('')
    const [title, setTitle] = useState('')
    const [shouldSearch, setShouldSearch] = useState(false)

    // Build search term from artist and title
    const searchTerm = artist.trim() ? `${artist.trim()} ${title.trim()}`.trim() : ''

    // Use the DVMCP hooks
    const { data: providers, isLoading: isLoadingProviders } = useDVMCPProviders()

    const {
        data: results = [],
        isLoading: isSearching,
        error,
    } = useDVMCPSearch(
        'discogs',
        searchTerm,
        { title: title.trim() },
        { enabled: shouldSearch && !!searchTerm && searchTerm.length >= 2 },
    )

    const handleSearch = () => {
        if (!artist.trim()) {
            return
        }
        setShouldSearch(true)
    }

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !isSearching) {
            handleSearch()
        }
    }

    const handleClear = () => {
        setArtist('')
        setTitle('')
        setShouldSearch(false)
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <Music className="h-5 w-5 text-blue-600" />
                <span className="font-semibold text-sm">Discogs Music Search</span>
                {isLoadingProviders && <Loader2 className="h-4 w-4 animate-spin text-gray-500" />}
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
                    placeholder="Song/Album title (optional)..."
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onKeyPress={handleKeyPress}
                    disabled={isSearching}
                    className="flex-1"
                />
                <Button
                    onClick={handleSearch}
                    disabled={isSearching || !artist.trim()}
                    className="flex items-center gap-2 min-w-[100px]"
                >
                    {isSearching ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Searching...
                        </>
                    ) : (
                        <>
                            <Search className="h-4 w-4" />
                            Search
                        </>
                    )}
                </Button>
            </div>

            {error && (
                <div className="text-red-500 text-sm bg-red-50 p-3 rounded-md">
                    Error: {error instanceof Error ? error.message : String(error)}
                </div>
            )}

            {shouldSearch && results.length === 0 && !isSearching && !error && (
                <div className="text-gray-500 text-sm bg-gray-50 p-3 rounded-md">
                    No results found. Try adjusting your search terms.
                </div>
            )}

            {results.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                            Found {results.length} result{results.length === 1 ? '' : 's'}
                        </span>
                        <Button variant="outline" size="sm" onClick={handleClear} className="text-xs">
                            Clear
                        </Button>
                    </div>

                    <div className="grid gap-2 max-h-64 overflow-y-auto">
                        {results.map((result: any) => (
                            <div
                                key={result.id}
                                className="flex items-center gap-3 p-3 border rounded-lg bg-white hover:bg-gray-50 transition-colors"
                            >
                                {result.thumb && (
                                    <img
                                        src={result.thumb}
                                        alt={result.title}
                                        className="w-12 h-12 rounded object-cover flex-shrink-0"
                                    />
                                )}
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-medium text-sm truncate">{result.title}</h3>
                                    {result.artist && <p className="text-gray-600 text-xs truncate">{result.artist}</p>}
                                    <div className="flex items-center gap-2 mt-1">
                                        {result.year && (
                                            <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                                {result.year}
                                            </span>
                                        )}
                                        {result.genre && result.genre.length > 0 && (
                                            <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                                                {result.genre[0]}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {result.resource_url && (
                                    <a
                                        href={result.resource_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex-shrink-0 p-2 text-gray-400 hover:text-blue-600 transition-colors"
                                        title="View on Discogs"
                                    >
                                        <ExternalLink className="h-4 w-4" />
                                    </a>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
