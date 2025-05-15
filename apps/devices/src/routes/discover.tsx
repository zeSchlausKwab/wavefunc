import { NDKKind } from '@nostr-dev-kit/ndk'
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
// import { useMedia } from 'react-use' // Removed useMedia as it's web-specific

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
}: {
    genres: string[]
    selectedGenre: string | null
    onSelectGenre: (genre: string | null) => void
}) {
    return (
        <div className="mb-4 max-w-full">
            <div className="overflow-x-auto pb-1 scrollbar-hide">
                <div className="flex flex-nowrap gap-1 w-max">
                    <Button
                        variant={selectedGenre === null ? 'default' : 'outline'}
                        size={'default'} // Removed isMobile check
                        onClick={() => onSelectGenre(null)}
                        className={cn('rounded-md whitespace-nowrap', 'py-1 px-3')} // Removed isMobile style check
                    >
                        All
                    </Button>

                    {genres.map((genre) => (
                        <Button
                            key={genre}
                            variant={selectedGenre === genre ? 'default' : 'outline'}
                            size={'default'} // Removed isMobile check
                            onClick={() => onSelectGenre(genre)}
                            className={cn(
                                'rounded-md whitespace-nowrap',
                                'py-1 px-3', // Removed isMobile style check
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
    hasActiveFilters,
    isActive,
    hasSearchTerm,
}: {
    value: string
    onChange: (value: string) => void
    onSearch: () => void
    onOpenFilters: () => void
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
                    className={cn('pl-9', 'h-10')} // Removed isMobile check
                />
            </div>
            <Button
                onClick={onSearch}
                variant={isActive && hasSearchTerm ? 'default' : 'secondary'}
                className={cn('h-10')} // Removed isMobile check
            >
                Search
            </Button>
            <Button
                onClick={onOpenFilters}
                variant={hasActiveFilters ? 'default' : 'outline'}
                className={cn('h-10 px-3')} // Removed isMobile check
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
    const [localFilters, setLocalFilters] = useState(filters)

    useEffect(() => {
        setLocalFilters(filters)
    }, [filters])

    const updateFilter = (key: keyof SearchFilters, value: any) => {
        setLocalFilters((prev) => ({ ...prev, [key]: value }))
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
                    <DialogTitle>Advanced Filters</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="tags" className="text-right">
                            Tags (comma-separated)
                        </Label>
                        <Input
                            id="tags"
                            value={localFilters.tags?.join(', ') || ''}
                            onChange={(e) =>
                                updateFilter(
                                    'tags',
                                    e.target.value ? e.target.value.split(',').map((t) => t.trim()) : null,
                                )
                            }
                            className="col-span-3"
                            placeholder="e.g. music, talk, news"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="languageCode" className="text-right">
                            Language
                        </Label>
                        <Select
                            value={localFilters.languageCode || ''}
                            onValueChange={(value) => updateFilter('languageCode', value || null)}
                        >
                            <SelectTrigger className="col-span-3">
                                <SelectValue placeholder="Select language" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="">Any Language</SelectItem>
                                {languages.map((lang) => (
                                    <SelectItem key={lang} value={lang}>
                                        {lang}
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
                            value={localFilters.domain || ''}
                            onChange={(e) => updateFilter('domain', e.target.value || null)}
                            className="col-span-3"
                            placeholder="e.g. example.com"
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

// Component to display active filters
function ActiveFilters({
    filters,
    onRemoveFilter,
    onClearFilters,
}: {
    filters: SearchFilters
    onRemoveFilter: (key: keyof SearchFilters) => void
    onClearFilters: () => void
}) {
    const activeFilterEntries = Object.entries(filters).filter(([key, value]) => {
        if (key === 'searchTerm' && typeof value === 'string' && value.trim() !== '') return true
        if (key === 'tags' && Array.isArray(value) && value.length > 0) return true
        if (key === 'languageCode' && typeof value === 'string' && value.trim() !== '') return true
        if (key === 'domain' && typeof value === 'string' && value.trim() !== '') return true
        return false
    })

    if (activeFilterEntries.length === 0) return null

    return (
        <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">Active Filters:</span>
            {activeFilterEntries.map(([key, value]) => (
                <Badge key={key} variant="secondary" className="flex items-center gap-1">
                    {key === 'tags' && Array.isArray(value) ? value.join(', ') : String(value)}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 p-0 ml-1"
                        onClick={() => onRemoveFilter(key as keyof SearchFilters)}
                    >
                        <X className="h-3 w-3" />
                    </Button>
                </Badge>
            ))}
            <Button variant="link" size="sm" onClick={onClearFilters} className="text-red-500">
                Clear All
            </Button>
        </div>
    )
}

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
    // const isMobile = useMedia('(max-width: 640px)', false) // Removed useMedia
    const { stations: liveStations, deletedStationIds } = useRadioStations()
    const [isLoading, setIsLoading] = useState(false)
    const [searchedStations, setSearchedStations] = useState<Station[]>([])
    const [showFiltersDialog, setShowFiltersDialog] = useState(false)

    // Unique list of genres and languages from live stations
    const allGenres = useMemo(() => {
        const genres = new Set<string>()
        liveStations.forEach((s) =>
            s.tags?.forEach((tag) => {
                if (tag[0] === 't') {
                    // Assuming 't' is the tag type for genres
                    genres.add(tag[1])
                }
            }),
        )
        return Array.from(genres).sort()
    }, [liveStations])

    const allLanguages = useMemo(() => {
        const languages = new Set<string>()
        liveStations.forEach((s) => {
            s.languageCodes?.forEach((lang) => languages.add(lang)) // Correctly use languageCodes array
        })
        return Array.from(languages).sort()
    }, [liveStations])

    const [filters, setFilters] = useState<SearchFilters>({
        searchTerm: '',
        tags: null, // This is string[] | null
        languageCode: null, // This is string | null
        domain: null,
    })

    const [activeSearch, setActiveSearch] = useState(false)

    const handleSearch = async () => {
        setIsLoading(true)
        setActiveSearch(true)
        try {
            const ndk = ndkActions.getSearchNdk() // Get NDK instance
            if (!ndk) throw new Error('Search NDK not available')
            const results = await searchRadioStations({
                // Pass NDK as first argument
                searchTerm: filters.searchTerm,
                tags: filters.tags || undefined,
                languageCode: filters.languageCode || undefined,
                domain: filters.domain || undefined,
            })
            setSearchedStations(results)
        } catch (error) {
            console.error('Error searching stations:', error)
            setSearchedStations([])
        } finally {
            setIsLoading(false)
        }
    }

    const handleSearchInputChange = (value: string) => {
        setFilters((prev) => ({ ...prev, searchTerm: value }))
        if (!value.trim()) {
            // If search term is cleared, reset active search and show live stations
            setActiveSearch(false)
            setSearchedStations([])
        }
    }

    const handleGenreSelect = (genre: string | null) => {
        const newTags = genre ? [genre] : null
        setFilters((prev) => ({ ...prev, tags: newTags }))
        if (filters.searchTerm.trim() || activeSearch || newTags) {
            // Also search if newTags is not null
            const newFilters = { ...filters, tags: newTags }
            searchWithNewFilters(newFilters)
        } else {
            // If no active search and no tags, just update the filter state
            // Potentially clear displayed stations if they were filtered by genre locally
            if (!newTags) {
                // Consider if local display should reset, or rely on activeSearch only
            }
        }
    }

    // Helper function to search with new filters
    const searchWithNewFilters = async (newFilters: SearchFilters) => {
        setIsLoading(true)
        setActiveSearch(true)
        try {
            const ndk = ndkActions.getSearchNdk() // Get NDK instance
            if (!ndk) throw new Error('Search NDK not available')
            const results = await searchRadioStations({
                // Pass NDK as first argument
                searchTerm: newFilters.searchTerm,
                tags: newFilters.tags || undefined,
                languageCode: newFilters.languageCode || undefined,
                domain: newFilters.domain || undefined,
            })
            setSearchedStations(results)
        } catch (error) {
            console.error('Error searching stations:', error)
            setSearchedStations([])
        } finally {
            setIsLoading(false)
        }
    }

    const handleFiltersChange = (newFilters: SearchFilters) => {
        setFilters(newFilters)
    }

    // This function is called when 'Apply Filters' in the dialog is clicked
    const applyAllFilters = () => {
        searchWithNewFilters(filters) // Use the helper
    }

    const removeFilter = (key: keyof SearchFilters) => {
        const newFilters = { ...filters, [key]: key === 'tags' ? null : '' } // Ensure tags becomes null if cleared
        setFilters(newFilters)
        if (!newFilters.searchTerm && !newFilters.tags && !newFilters.languageCode && !newFilters.domain) {
            setActiveSearch(false)
            setSearchedStations([])
        } else {
            searchWithNewFilters(newFilters)
        }
    }

    const clearAllFilters = () => {
        const clearedFilters = {
            searchTerm: '',
            tags: null,
            languageCode: null,
            domain: null,
        }
        setFilters(clearedFilters)
        setActiveSearch(false)
        setSearchedStations([])
    }

    const displayedStations = useMemo(() => {
        let stationsToDisplay = activeSearch ? searchedStations : liveStations
        stationsToDisplay = stationsToDisplay.filter((station) => !deletedStationIds.has(station.id))

        if (!activeSearch && filters.tags && filters.tags.length > 0) {
            const selectedGenre = filters.tags[0]
            return stationsToDisplay.filter(
                (station) => station.tags && station.tags.some((tag) => tag[0] === 't' && tag[1] === selectedGenre), // Corrected genre filtering
            )
        }
        return stationsToDisplay
    }, [activeSearch, searchedStations, liveStations, filters.tags, deletedStationIds])

    const hasActiveNonSearchTermFilters = !!(filters.tags?.length || filters.languageCode || filters.domain)

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <h1 className="text-3xl font-bold">Discover Radio Stations</h1>
                {/* Search and filter components will go here */}
            </div>

            <div className="flex flex-col items-start mb-6 gap-y-2">
                <SearchInput
                    value={filters.searchTerm}
                    onChange={handleSearchInputChange}
                    onSearch={handleSearch} // This is the button click for search
                    onOpenFilters={() => setShowFiltersDialog(true)}
                    // isMobile={isMobile} // Removed
                    hasActiveFilters={!!hasActiveNonSearchTermFilters}
                    isActive={activeSearch} // is active if a search has been performed
                    hasSearchTerm={!!filters.searchTerm.trim()} // To highlight search button if there is text
                />
                <GenreSelector
                    genres={allGenres}
                    selectedGenre={filters.tags ? filters.tags[0] : null} // Assuming single genre selection
                    onSelectGenre={handleGenreSelect}
                    // isMobile={isMobile} // Removed
                />
                <ActiveFilters filters={filters} onRemoveFilter={removeFilter} onClearFilters={clearAllFilters} />
            </div>

            {isLoading ? (
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                </div>
            ) : (
                <StationGrid stations={displayedStations} isMobile={true} /> // Added isMobile={true}
            )}

            <AdvancedFilters
                open={showFiltersDialog}
                onOpenChange={setShowFiltersDialog}
                filters={filters}
                onFiltersChange={handleFiltersChange} // This updates the main filters state
                onApplyFilters={applyAllFilters} // This triggers the search with current filters
                languages={allLanguages}
            />
        </div>
    )
}
