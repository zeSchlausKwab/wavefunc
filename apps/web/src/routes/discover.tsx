import { NDKKind } from '@nostr-dev-kit/ndk'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import {
    cn,
    mapNostrEventToStation,
    ndkActions,
    RADIO_EVENT_KINDS,
    searchRadioStations,
    type NDKFilter,
    type Station,
} from '@wavefunc/common'
import StationGrid from '@wavefunc/common/src/components/station/StationGrid'
import { Badge } from '@wavefunc/ui/components/ui/badge'
import { Button } from '@wavefunc/ui/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@wavefunc/ui/components/ui/dialog'
import { Input } from '@wavefunc/ui/components/ui/input'
import { Label } from '@wavefunc/ui/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@wavefunc/ui/components/ui/select'
import { Filter, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useMedia } from 'react-use'

// Component for real-time stations from subscription
function useRadioStations() {
    const [stations, setStations] = useState<Station[]>([])
    const [deletedStationIds, setDeletedStationIds] = useState<Set<string>>(new Set())

    // Subscribe to deleted station events (kind 5)
    useEffect(() => {
        const ndk = ndkActions.getNDK()
        if (!ndk) return

        const sub = ndk.subscribe(
            {
                kinds: [5],
            },
            { closeOnEose: false },
        )

        // Use a more generic handler that works with any NDK version
        sub.on('event', (event: any) => {
            try {
                // Work with raw event data to avoid version conflicts
                const rawEvent = event.rawEvent ? event.rawEvent() : event
                const deletedIds = rawEvent.tags
                    .filter((tag: string[]) => tag[0] === 'e')
                    .map((tag: string[]) => tag[1])

                if (deletedIds.length > 0) {
                    // Update deleted IDs set
                    setDeletedStationIds((prev) => {
                        const newSet = new Set(prev)
                        deletedIds.forEach((id: string) => newSet.add(id))
                        return newSet
                    })

                    // Remove deleted stations from the list
                    setStations((prev) => prev.filter((station) => !deletedIds.includes(station.id)))
                }
            } catch (error) {
                console.error('Error processing deletion event:', error)
            }
        })

        return () => {
            sub.stop()
        }
    }, [])

    // Process an incoming station event
    const processNewStationEvent = (event: any) => {
        try {
            // Use the mapNostrEventToStation function to get a complete Station object
            const station = mapNostrEventToStation(event)

            setStations((prevStations) => {
                // Check if we already have this station
                const exists = prevStations.some((s) => s.id === station.id)
                if (exists) return prevStations

                return [...prevStations, station]
            })
        } catch (e) {
            console.error('Error processing station event:', e)
        }
    }

    // Subscribe to radio station events
    useEffect(() => {
        const ndk = ndkActions.getNDK()
        if (!ndk) return

        // Use a Set to track processed event IDs within this component
        const processedEvents = new Set<string>()

        // Subscribe to radio stations but handle the callback manually to avoid type issues
        const filter = {
            kinds: [RADIO_EVENT_KINDS.STREAM as NDKKind],
            limit: 12,
        } as NDKFilter

        // Create subscription without a callback
        const subscription = ndk.subscribe(filter, {
            closeOnEose: false,
        })

        // Add event handler separately to avoid the type mismatch in the function signature
        subscription.on('event', (event: any) => {
            // Get the raw event data which is compatible across NDK versions
            const rawEvent = event.rawEvent ? event.rawEvent() : event

            // Skip processing if we've already handled this event
            if (rawEvent && rawEvent.id && processedEvents.has(rawEvent.id)) {
                return
            }

            // Mark the event as processed if it has an ID
            if (rawEvent && rawEvent.id) {
                processedEvents.add(rawEvent.id)

                // Process using the raw event data
                processNewStationEvent(event)
            }
        })

        return () => {
            subscription.stop()
        }
    }, []) // Empty dependency array - only run once

    return {
        stations,
        deletedStationIds,
    }
}

// Genre selector component
function GenreSelector({
    genres,
    selectedGenre,
    onSelectGenre,
    isMobile,
}: {
    genres: string[]
    selectedGenre: string | null
    onSelectGenre: (genre: string | null) => void
    isMobile: boolean
}) {
    return (
        <div className="mb-4 max-w-full">
            <div className="overflow-x-auto pb-1 scrollbar-hide">
                <div className="flex flex-nowrap gap-1 w-max">
                    <Button
                        variant={selectedGenre === null ? 'default' : 'outline'}
                        size={isMobile ? 'sm' : 'default'}
                        onClick={() => onSelectGenre(null)}
                        className={cn('rounded-md whitespace-nowrap', isMobile ? 'text-xs py-1 px-2 h-7' : 'py-1 px-3')}
                    >
                        All
                    </Button>

                    {genres.map((genre) => (
                        <Button
                            key={genre}
                            variant={selectedGenre === genre ? 'default' : 'outline'}
                            size={isMobile ? 'sm' : 'default'}
                            onClick={() => onSelectGenre(genre)}
                            className={cn(
                                'rounded-md whitespace-nowrap',
                                isMobile ? 'text-xs py-1 px-2 h-7' : 'py-1 px-3',
                            )}
                        >
                            {genre}
                        </Button>
                    ))}
                </div>
            </div>
        </div>
    )
}

// Search input component with button
function SearchInput({
    value,
    onChange,
    onSearch,
    onOpenFilters,
    isMobile,
    hasActiveFilters,
    isActive,
    hasSearchTerm,
}: {
    value: string
    onChange: (value: string) => void
    onSearch: () => void
    onOpenFilters: () => void
    isMobile: boolean
    hasActiveFilters: boolean
    isActive: boolean
    hasSearchTerm: boolean
}) {
    // Handle enter key press
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            onSearch()
        }
    }

    return (
        <div className="flex w-full max-w-md mb-4 gap-2">
            <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    type="text"
                    placeholder="Search stations by name, genre, location..."
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className={cn('pl-9', isMobile ? 'h-9' : 'h-10')}
                />
            </div>
            <Button
                onClick={onSearch}
                variant={isActive && hasSearchTerm ? 'default' : 'secondary'}
                className={cn(isMobile ? 'h-9 px-3' : 'h-10')}
            >
                Search
            </Button>
            <Button
                onClick={onOpenFilters}
                variant={hasActiveFilters ? 'default' : 'outline'}
                className={cn(isMobile ? 'h-9 px-2 min-w-9' : 'h-10 px-3')}
                title="Advanced Filters"
            >
                <Filter className="h-4 w-4" />
            </Button>
        </div>
    )
}

// Advanced search filters dialog
function AdvancedFilters({
    open,
    onOpenChange,
    filters,
    onFiltersChange,
    onApplyFilters,
    languages,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    filters: SearchFilters
    onFiltersChange: (filters: SearchFilters) => void
    onApplyFilters: () => void
    languages: string[]
}) {
    const [localFilters, setLocalFilters] = useState<SearchFilters>(filters)

    // Reset local filters when dialog opens
    useEffect(() => {
        if (open) {
            setLocalFilters({ ...filters })
        }
    }, [open, filters])

    // Update a single filter value
    const updateFilter = (key: keyof SearchFilters, value: any) => {
        setLocalFilters((prev) => ({
            ...prev,
            [key]: value,
        }))
    }

    const handleApply = () => {
        onFiltersChange(localFilters)
        onApplyFilters()
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Advanced Search Filters</DialogTitle>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="language" className="text-right">
                            Language
                        </Label>
                        <Select
                            value={localFilters.languageCode || 'none'}
                            onValueChange={(value) => updateFilter('languageCode', value === 'none' ? null : value)}
                        >
                            <SelectTrigger className="col-span-3">
                                <SelectValue placeholder="Any language" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Any language</SelectItem>
                                {languages.map((lang) => (
                                    <SelectItem key={lang} value={lang}>
                                        {lang.toUpperCase()}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="domain" className="text-right">
                            Domain
                        </Label>
                        <Input
                            id="domain"
                            placeholder="e.g., wavefunc.io"
                            value={localFilters.domain || ''}
                            onChange={(e) => updateFilter('domain', e.target.value || null)}
                            className="col-span-3"
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleApply}>Apply Filters</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// Active filters display
function ActiveFilters({
    filters,
    onRemoveFilter,
    onClearFilters,
}: {
    filters: SearchFilters
    onRemoveFilter: (key: keyof SearchFilters) => void
    onClearFilters: () => void
}) {
    const activeFilters = Object.entries(filters).filter(
        ([_, value]) => value !== null && value !== undefined && value !== '',
    )

    if (activeFilters.length === 0) return null

    return (
        <div className="flex flex-wrap gap-2 mb-4">
            {activeFilters.map(([key, value]) => {
                // Skip searchTerm as it's shown in the search box
                if (key === 'searchTerm') return null

                // Format label based on filter type
                let label = ''
                switch (key) {
                    case 'languageCode':
                        label = `Language: ${value.toUpperCase()}`
                        break
                    case 'domain':
                        label = `Domain: ${value}`
                        break
                    case 'tags':
                        // Tags are handled via the genre selector
                        return null
                    default:
                        label = `${key}: ${value}`
                }

                return (
                    <Badge key={key} variant="secondary" className="flex items-center gap-1">
                        {label}
                        <X
                            className="h-3 w-3 cursor-pointer"
                            onClick={() => onRemoveFilter(key as keyof SearchFilters)}
                        />
                    </Badge>
                )
            })}

            {activeFilters.length > 1 && (
                <Button variant="ghost" size="sm" onClick={onClearFilters} className="h-6 px-2 text-xs">
                    Clear all
                </Button>
            )}
        </div>
    )
}

// Type for search filters
interface SearchFilters {
    searchTerm: string
    tags: string[] | null
    languageCode: string | null
    domain: string | null
}

export const Route = createFileRoute('/discover')({
    component: Index,
})

function Index() {
    // Search state
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedGenre, setSelectedGenre] = useState<string | null>(null)
    const [filtersOpen, setFiltersOpen] = useState(false)

    // Advanced filters state
    const [filters, setFilters] = useState<SearchFilters>({
        searchTerm: '',
        tags: null,
        languageCode: null,
        domain: null,
    })

    // Check if any advanced filters are active
    const hasActiveAdvancedFilters = useMemo(() => {
        return Boolean(filters.languageCode) || Boolean(filters.domain)
    }, [filters])

    // Responsive state
    const isMobile = useMedia('(max-width: 640px)')

    // Use Tanstack Query to fetch stations with search parameters
    const { data: searchResults, isLoading } = useQuery({
        queryKey: ['stations', 'search', filters],
        queryFn: async () => {
            const ndk = ndkActions.getNDK()
            if (!ndk) return []

            try {
                // First attempt with exact filters
                const results = await searchRadioStations(ndk, {
                    searchTerm: filters.searchTerm,
                    tags: filters.tags || undefined,
                    languageCode: filters.languageCode || undefined,
                    domain: filters.domain || undefined,
                })

                // If we got results, return them
                if (results.length > 0) {
                    return results
                }

                // If no results and we have a search term, try a more flexible search
                if (filters.searchTerm && !filters.tags && !filters.languageCode && !filters.domain) {
                    // Try searching with the term as a tag instead
                    const tagResults = await searchRadioStations(ndk, {
                        searchTerm: '', // Clear search term
                        tags: [filters.searchTerm.toLowerCase()], // Use as tag
                    })

                    if (tagResults.length > 0) {
                        return tagResults
                    }

                    const recentResults = await searchRadioStations(ndk, {
                        since: Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 30, // Last 30 days
                    })

                    return recentResults
                }

                return results
            } catch (error) {
                console.error('❌ Error during search:', error)
                return []
            }
        },
        enabled:
            Boolean(filters.searchTerm) ||
            Boolean(filters.tags) ||
            Boolean(filters.languageCode) ||
            Boolean(filters.domain),
        refetchOnWindowFocus: false,
        staleTime: 1000 * 60 * 5, // 5 minutes
    })

    // Handle search button click
    const handleSearch = () => {
        // Prepare search term - trim and handle special characters
        const cleanSearchTerm = searchTerm.trim()

        if (cleanSearchTerm !== filters.searchTerm) {
            // Only update if the value has changed
            setFilters((prev) => ({
                ...prev,
                searchTerm: cleanSearchTerm,
            }))
        }
    }

    // Handle direct input changes
    const handleSearchInputChange = (value: string) => {
        // Just update the local state, don't update filters until search is triggered
        setSearchTerm(value)
    }

    // Handle genre selection
    const handleGenreSelect = (genre: string | null) => {
        setSelectedGenre(genre)

        // Update tags filter
        setFilters((prev) => ({
            ...prev,
            tags: genre ? [genre] : null,
        }))
    }

    // Handle filter changes
    const handleFiltersChange = (newFilters: SearchFilters) => {
        // Apply filter changes directly
        setFilters(newFilters)

        // Also update the local search term to keep UI in sync
        if (newFilters.searchTerm !== searchTerm) {
            setSearchTerm(newFilters.searchTerm || '')
        }
    }

    // Apply all filters together
    const applyAllFilters = () => {
        console.log('Applying all filters:', filters)
        // Nothing else needed - the filters state is directly used by the query
    }

    // Remove a specific filter
    const removeFilter = (key: keyof SearchFilters) => {
        setFilters((prev) => ({
            ...prev,
            [key]: null,
        }))

        // If removing a tag filter, also update the selected genre
        if (key === 'tags') {
            setSelectedGenre(null)
        }
    }

    // Clear all filters
    const clearAllFilters = () => {
        // Reset the UI state
        setSearchTerm('')
        setSelectedGenre(null)

        // Reset the filter state that drives the search
        setFilters({
            searchTerm: '',
            tags: null,
            languageCode: null,
            domain: null,
        })
    }

    // Get real-time station updates from subscription
    const { stations: realtimeStations } = useRadioStations()

    // Combine search results with real-time stations
    const allStations = useMemo(() => {
        // If we have any active filters, use search results
        if (
            Boolean(filters.searchTerm) ||
            Boolean(filters.tags) ||
            Boolean(filters.languageCode) ||
            Boolean(filters.domain)
        ) {
            return searchResults || []
        }

        // Otherwise show real-time stations
        return realtimeStations
    }, [searchResults, realtimeStations])

    // Extract unique genres from stations
    const genres = useMemo(() => {
        // Collect all t tags from all stations
        const allStationsForGenres =
            searchTerm || selectedGenre ? [...realtimeStations, ...(searchResults || [])] : realtimeStations

        return Array.from(
            new Set(
                allStationsForGenres.flatMap((station) =>
                    station.tags
                        .filter((tag) => tag[0] === 't')
                        .map((tag) => tag[1])
                        .filter(Boolean),
                ),
            ),
        ).sort((a, b) => a.localeCompare(b))
    }, [realtimeStations, searchResults, searchTerm, selectedGenre])

    // Extract unique languages from stations
    const languages = useMemo(() => {
        // Collect all l tags from all stations
        const allStationsForLanguages = [...realtimeStations, ...(searchResults || [])]

        return Array.from(new Set(allStationsForLanguages.flatMap((station) => station.languageCodes || []))).sort(
            (a, b) => a.localeCompare(b),
        )
    }, [realtimeStations, searchResults])

    return (
        <div className="w-full flex flex-col gap-4 my-6 max-w-full">
            <SearchInput
                value={searchTerm}
                onChange={handleSearchInputChange}
                onSearch={handleSearch}
                onOpenFilters={() => setFiltersOpen(true)}
                isMobile={isMobile}
                hasActiveFilters={hasActiveAdvancedFilters}
                isActive={
                    Boolean(filters.searchTerm) ||
                    Boolean(filters.tags) ||
                    Boolean(filters.languageCode) ||
                    Boolean(filters.domain)
                }
                hasSearchTerm={Boolean(searchTerm)}
            />

            <ActiveFilters filters={filters} onRemoveFilter={removeFilter} onClearFilters={clearAllFilters} />

            <GenreSelector
                genres={genres}
                selectedGenre={selectedGenre}
                onSelectGenre={handleGenreSelect}
                isMobile={isMobile}
            />

            <AdvancedFilters
                open={filtersOpen}
                onOpenChange={setFiltersOpen}
                filters={filters}
                onFiltersChange={handleFiltersChange}
                onApplyFilters={applyAllFilters}
                languages={languages}
            />

            {isLoading ? (
                <div className="flex justify-center my-8">
                    <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full"></div>
                </div>
            ) : (
                <StationGrid stations={allStations} isMobile={isMobile} />
            )}
        </div>
    )
}
