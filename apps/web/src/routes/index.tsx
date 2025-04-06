import { useTopClickedStations, useSearchStations } from '@/hooks/useRadioBrowser'
import { Button } from '@/components/ui/button'
import { RadioStationCard } from '@/components/radio/RadioStationCard'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Filter, RefreshCw, Search } from 'lucide-react'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useAutoAnimate } from '@formkit/auto-animate/react'
import type { RadioBrowserParams, Station } from '@wavefunc/common/types'
import { RadioCard } from '@/components/radio/RadioCard'

interface SearchFilters {
    countrycode: string
    language: string
    tag: string
    codec: string
    bitrateMin: number
    bitrateMax: number
}

export const Route = createFileRoute('/')({
    component: Index,
})

function Index() {
    const [searchQuery, setSearchQuery] = useState('')
    const [showFilters, setShowFilters] = useState(false)
    const [isSearchMode, setIsSearchMode] = useState(false)
    const [filters, setFilters] = useState<SearchFilters>({
        countrycode: 'all',
        language: 'all',
        tag: '',
        codec: 'all',
        bitrateMin: 0,
        bitrateMax: 0,
    })

    const [gridRef] = useAutoAnimate<HTMLDivElement>({
        duration: 300,
        easing: 'ease-in-out',
    })

    const getSearchParams = (): RadioBrowserParams => {
        const params: RadioBrowserParams = {}

        if (searchQuery) params.name = searchQuery
        if (filters.countrycode && filters.countrycode !== 'all') params.countrycode = filters.countrycode
        if (filters.language && filters.language !== 'all') params.language = filters.language
        if (filters.tag) params.tag = filters.tag
        if (filters.codec && filters.codec !== 'all') params.codec = filters.codec
        if (filters.bitrateMin) params.bitrateMin = filters.bitrateMin
        if (filters.bitrateMax) params.bitrateMax = filters.bitrateMax

        params.limit = 20

        return params
    }

    // Fetch top stations by default
    const {
        data: topStations = [],
        isLoading: isLoadingTop,
        refetch: refetchTop,
        isError: isTopError,
    } = useTopClickedStations(12, true)

    // Search stations when needed
    const {
        data: searchResults = [],
        isLoading: isSearchLoading,
        refetch: searchRefetch,
        isError: isSearchError,
    } = useSearchStations(getSearchParams(), false)

    const searchStations = () => {
        setIsSearchMode(true)
        searchRefetch()
    }

    const resetSearch = () => {
        setIsSearchMode(false)
        setSearchQuery('')
        setFilters({
            countrycode: 'all',
            language: 'all',
            tag: '',
            codec: 'all',
            bitrateMin: 0,
            bitrateMax: 0,
        })
    }

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            searchStations()
        }
    }

    const handleFilterChange = (key: keyof SearchFilters, value: string | number) => {
        setFilters((prev) => ({ ...prev, [key]: value }))
    }

    // Determine which stations to display
    const displayStations = isSearchMode ? (searchResults as Station[]) : (topStations as Station[])
    const isLoading = isSearchMode ? isSearchLoading : isLoadingTop
    const isError = isSearchMode ? isSearchError : isTopError

    return (
        <div>
            <div className="flex flex-col gap-4 mb-6">
                <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-semibold">{isSearchMode ? 'Search Results' : 'Top Radio Stations'}</h2>
                    <div className="flex gap-2">
                        {isSearchMode && (
                            <Button onClick={resetSearch} size="sm" variant="outline">
                                Back to Top Stations
                            </Button>
                        )}
                        {!isSearchMode && (
                            <Button onClick={() => refetchTop()} size="sm" variant="outline" disabled={isLoadingTop}>
                                <RefreshCw className={`w-4 h-4 mr-2 ${isLoadingTop ? 'animate-spin' : ''}`} />
                                Refresh
                            </Button>
                        )}
                    </div>
                </div>

                <div className="flex gap-2">
                    <Input
                        type="text"
                        placeholder="Search radio stations..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyPress={handleKeyPress}
                        className="flex-1"
                    />
                    <Button onClick={() => setShowFilters(!showFilters)} variant="outline">
                        <Filter className="w-4 h-4 mr-2" />
                        Filters
                    </Button>
                    <Button onClick={searchStations} disabled={isLoading}>
                        <Search className="w-4 h-4 mr-2" />
                        Search
                    </Button>
                </div>
            </div>

            {showFilters && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Country</label>
                        <Select
                            value={filters.countrycode}
                            onValueChange={(value) => handleFilterChange('countrycode', value)}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select country" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All countries</SelectItem>
                                <SelectItem value="US">United States</SelectItem>
                                <SelectItem value="GB">United Kingdom</SelectItem>
                                <SelectItem value="DE">Germany</SelectItem>
                                <SelectItem value="FR">France</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Language</label>
                        <Select
                            value={filters.language}
                            onValueChange={(value) => handleFilterChange('language', value)}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select language" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All languages</SelectItem>
                                <SelectItem value="english">English</SelectItem>
                                <SelectItem value="german">German</SelectItem>
                                <SelectItem value="french">French</SelectItem>
                                <SelectItem value="spanish">Spanish</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Codec</label>
                        <Select value={filters.codec} onValueChange={(value) => handleFilterChange('codec', value)}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select codec" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All codecs</SelectItem>
                                <SelectItem value="MP3">MP3</SelectItem>
                                <SelectItem value="AAC">AAC</SelectItem>
                                <SelectItem value="OGG">OGG</SelectItem>
                                <SelectItem value="WMA">WMA</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Min Bitrate (kbps)</label>
                        <Input
                            type="number"
                            value={filters.bitrateMin || ''}
                            onChange={(e) => handleFilterChange('bitrateMin', parseInt(e.target.value) || 0)}
                            placeholder="Min bitrate"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Max Bitrate (kbps)</label>
                        <Input
                            type="number"
                            value={filters.bitrateMax || ''}
                            onChange={(e) => handleFilterChange('bitrateMax', parseInt(e.target.value) || 0)}
                            placeholder="Max bitrate"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Tag</label>
                        <Input
                            type="text"
                            value={filters.tag}
                            onChange={(e) => handleFilterChange('tag', e.target.value)}
                            placeholder="e.g., jazz, rock, classical"
                        />
                    </div>
                </div>
            )}

            {isError && (
                <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
                    Failed to load radio stations. Please try again.
                </div>
            )}

            {isLoading ? (
                <div className="flex justify-center items-center p-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
            ) : (
                <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {displayStations.map((station) => (
                        <RadioCard key={station.id} station={station} />
                    ))}
                </div>
            )}
        </div>
    )
}
