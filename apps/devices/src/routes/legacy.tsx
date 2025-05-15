import { useAutoAnimate } from '@formkit/auto-animate/react'
import { createFileRoute } from '@tanstack/react-router'
// import APIStationCard from '@wavefunc/common/src/components/radio/APIStationCard' // TODO: Implement or adapt for mobile
// import type { RadioBrowserParams } from '@wavefunc/common/src/types/radioBrowser' // TODO: Define if needed
// import type { Station } from '@wavefunc/common/src/types/station' // TODO: Define if needed
import { Badge } from '@wavefunc/ui/components/ui/badge'
import { Button } from '@wavefunc/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@wavefunc/ui/components/ui/card'
import { Input } from '@wavefunc/ui/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@wavefunc/ui/components/ui/select'
import { Separator } from '@wavefunc/ui/components/ui/separator'
import { Skeleton } from '@wavefunc/ui/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@wavefunc/ui/components/ui/tabs'
import { Filter, Headphones, Radio, RefreshCw, Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'

// TODO: Data fetching for legacy radio browser needs to be implemented.
// The web app uses custom hooks (useSearchStations, useTopClickedStations)
// which are not directly available here. Consider a direct API client for radio-browser.info.

interface SearchFilters {
    countrycode: string
    language: string
    tag: string
    codec: string
    bitrateMin: number
    bitrateMax: number
}

export const Route = createFileRoute('/legacy')({
    component: Legacy,
})

function Legacy() {
    const [searchQuery, setSearchQuery] = useState('')
    const [showFilters, setShowFilters] = useState(false)
    const [isSearchMode, setIsSearchMode] = useState(false)
    const [activeTab, setActiveTab] = useState<'top' | 'search'>('top')
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

    // const getSearchParams = (): RadioBrowserParams => { // TODO: Implement search param logic
    //     const params: RadioBrowserParams = {}
    //     // ... (logic from web app)
    //     params.limit = 20
    //     return params
    // }

    // TODO: Implement data fetching for top stations and search results
    // const { data: topStations = [], isLoading: isLoadingTop, refetch: refetchTop, isError: isTopError } = useTopClickedStations(12, true)
    // const { data: searchResults = [], isLoading: isSearchLoading, refetch: searchRefetch, isError: isSearchError } = useSearchStations(getSearchParams(), false)

    const searchStations = () => {
        setIsSearchMode(true)
        setActiveTab('search')
        // searchRefetch() // TODO: Trigger search
        console.log('Search triggered with query:', searchQuery, 'Filters:', filters)
    }

    const resetSearch = () => {
        setIsSearchMode(false)
        setActiveTab('top')
        setSearchQuery('')
        setFilters({
            countrycode: 'all',
            language: 'all',
            tag: '',
            codec: 'all',
            bitrateMin: 0,
            bitrateMax: 0,
        })
        console.log('Search reset')
    }

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            searchStations()
        }
    }

    const handleFilterChange = (key: keyof SearchFilters, value: string | number) => {
        setFilters((prev) => ({ ...prev, [key]: value }))
    }

    useEffect(() => {
        setActiveTab(isSearchMode ? 'search' : 'top')
    }, [isSearchMode])

    // const displayStations = isSearchMode ? (searchResults as Station[]) : (topStations as Station[]) // TODO: Determine display stations
    // const isLoading = isSearchMode ? isSearchLoading : isLoadingTop // TODO: Determine loading state
    // const isError = isSearchMode ? isSearchError : isTopError // TODO: Determine error state
    const displayStations: any[] = [] // Placeholder
    const isLoading = false // Placeholder
    const isError = false // Placeholder

    const activeFiltersCount = Object.entries(filters).filter(([key, value]) => {
        if (key === 'countrycode' || key === 'language' || key === 'codec') {
            return value !== 'all'
        }
        if (key === 'tag') {
            return value !== ''
        }
        if (key === 'bitrateMin' || key === 'bitrateMax') {
            return value > 0
        }
        return false
    }).length

    return (
        <div className="container mx-auto py-8">
            <div className="space-y-6">
                <Card className="border-none shadow-md bg-gradient-to-r from-background to-muted/30">
                    <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                            <Radio className="h-6 w-6 text-primary" />
                            <CardTitle className="text-3xl font-bold">LegacyRadio Explorer</CardTitle>
                        </div>
                        <CardDescription>
                            Can't find what you're looking for? Try our legacy radio browser and bring the station to
                            nostr.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-col gap-4">
                            <div className="flex flex-col sm:flex-row gap-2">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        type="text"
                                        placeholder="Search radio stations..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        onKeyPress={handleKeyPress}
                                        className="pl-9 pr-4"
                                    />
                                    {searchQuery && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                                            onClick={() => setSearchQuery('')}
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                                <Button
                                    onClick={() => setShowFilters(!showFilters)}
                                    variant="outline"
                                    className="sm:w-auto w-full"
                                >
                                    <Filter className="w-4 h-4 mr-2" />
                                    Filters
                                    {activeFiltersCount > 0 && (
                                        <Badge variant="secondary" className="ml-2">
                                            {activeFiltersCount}
                                        </Badge>
                                    )}
                                </Button>
                                <Button onClick={searchStations} disabled={isLoading} className="sm:w-auto w-full">
                                    <Search className="w-4 h-4 mr-2" />
                                    Search
                                </Button>
                            </div>

                            {showFilters && (
                                <div className="bg-muted/40 rounded-lg p-4 border border-border/50 animate-in fade-in-50 duration-200">
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                                                    {/* TODO: Add more countries or fetch dynamically */}
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
                                                    {/* TODO: Add more languages or fetch dynamically */}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Codec</label>
                                            <Select
                                                value={filters.codec}
                                                onValueChange={(value) => handleFilterChange('codec', value)}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select codec" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="all">All codecs</SelectItem>
                                                    <SelectItem value="MP3">MP3</SelectItem>
                                                    <SelectItem value="AAC">AAC</SelectItem>
                                                    <SelectItem value="OGG">OGG</SelectItem>
                                                    <SelectItem value="WMA">WMA</SelectItem>
                                                    {/* TODO: Add more codecs or fetch dynamically */}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Tag</label>
                                            <Input
                                                type="text"
                                                placeholder="e.g. jazz, rock"
                                                value={filters.tag}
                                                onChange={(e) => handleFilterChange('tag', e.target.value)}
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Min Bitrate</label>
                                            <Input
                                                type="number"
                                                placeholder="e.g. 128"
                                                value={filters.bitrateMin > 0 ? filters.bitrateMin : ''}
                                                onChange={(e) =>
                                                    handleFilterChange('bitrateMin', parseInt(e.target.value) || 0)
                                                }
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Max Bitrate</label>
                                            <Input
                                                type="number"
                                                placeholder="e.g. 320"
                                                value={filters.bitrateMax > 0 ? filters.bitrateMax : ''}
                                                onChange={(e) =>
                                                    handleFilterChange('bitrateMax', parseInt(e.target.value) || 0)
                                                }
                                            />
                                        </div>
                                    </div>
                                    <div className="mt-4 flex justify-end gap-2">
                                        <Button variant="ghost" onClick={resetSearch}>
                                            Reset Filters
                                        </Button>
                                        <Button onClick={searchStations}>Apply Filters</Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Separator />

                <Tabs
                    defaultValue="top"
                    className="w-full"
                    value={activeTab}
                    onValueChange={(value) => setActiveTab(value as 'top' | 'search')}
                >
                    <div className="flex justify-between items-center mb-4">
                        <TabsList>
                            <TabsTrigger
                                value="top"
                                onClick={() => {
                                    setActiveTab('top')
                                    setIsSearchMode(false)
                                }}
                            >
                                <Headphones className="w-4 h-4 mr-2" />
                                Top Stations
                            </TabsTrigger>
                            <TabsTrigger
                                value="search"
                                onClick={() => {
                                    setActiveTab('search')
                                    setIsSearchMode(true)
                                }}
                            >
                                <Search className="w-4 h-4 mr-2" />
                                Search Results
                            </TabsTrigger>
                        </TabsList>
                        <Button
                            variant="outline"
                            onClick={
                                isSearchMode
                                    ? searchStations
                                    : () => {
                                          /* refetchTop() */
                                      }
                            }
                            disabled={isLoading}
                        >
                            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                            Refresh
                        </Button>
                    </div>
                    <TabsContent value="top">
                        {isLoading && !isError && <StationGridSkeleton />}
                        {isError && <p className="text-red-500 text-center">Error loading top stations.</p>}
                        {!isLoading && !isError && displayStations.length === 0 && (
                            <p className="text-muted-foreground text-center py-8">No top stations found.</p>
                        )}
                        {!isLoading && !isError && displayStations.length > 0 && (
                            <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {/* {displayStations.map((station: Station) => (
                                    <APIStationCard key={station.stationuuid} station={station} />
                                ))} */}
                                {/* Placeholder for stations */}
                                <p className="text-muted-foreground text-center col-span-full py-8">
                                    Station display area (TODO)
                                </p>
                            </div>
                        )}
                    </TabsContent>
                    <TabsContent value="search">
                        {isLoading && !isError && <StationGridSkeleton />}
                        {isError && <p className="text-red-500 text-center">Error searching stations.</p>}
                        {!isLoading && !isError && displayStations.length === 0 && isSearchMode && (
                            <p className="text-muted-foreground text-center py-8">No stations found for your search.</p>
                        )}
                        {!isLoading && !isError && displayStations.length > 0 && isSearchMode && (
                            <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {/* {displayStations.map((station: Station) => (
                                    <APIStationCard key={station.stationuuid} station={station} />
                                ))} */}
                                {/* Placeholder for stations */}
                                <p className="text-muted-foreground text-center col-span-full py-8">
                                    Station display area (TODO)
                                </p>
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    )
}

// Skeleton loader for the station grid
function StationGridSkeleton() {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-card p-4 rounded-lg shadow">
                    <Skeleton className="h-24 w-full mb-2" />
                    <Skeleton className="h-6 w-3/4 mb-1" />
                    <Skeleton className="h-4 w-1/2" />
                </div>
            ))}
        </div>
    )
}
