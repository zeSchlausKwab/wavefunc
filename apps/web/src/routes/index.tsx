import { useSearchStations, useTopClickedStations } from '@/hooks/useRadioBrowser'
import { useAutoAnimate } from '@formkit/auto-animate/react'
import { createFileRoute } from '@tanstack/react-router'
import RadioCard from '@wavefunc/common/src/components/radio/RadioCard'
import APIStationCard from '@wavefunc/common/src/components/radio/APIStationCard'
import type { RadioBrowserParams } from '@wavefunc/common/src/types/radioBrowser'
import type { Station } from '@wavefunc/common/src/types/station'
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
        setActiveTab('search')
        searchRefetch()
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
    }

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            searchStations()
        }
    }

    const handleFilterChange = (key: keyof SearchFilters, value: string | number) => {
        setFilters((prev) => ({ ...prev, [key]: value }))
    }

    // Update active tab when search mode changes
    useEffect(() => {
        setActiveTab(isSearchMode ? 'search' : 'top')
    }, [isSearchMode])

    // Determine which stations to display
    const displayStations = isSearchMode ? (searchResults as Station[]) : (topStations as Station[])
    const isLoading = isSearchMode ? isSearchLoading : isLoadingTop
    const isError = isSearchMode ? isSearchError : isTopError

    const [date, setDate] = useState<Date | undefined>(new Date())

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
                            <CardTitle className="text-3xl font-bold">Radio Explorer</CardTitle>
                        </div>
                        <CardDescription>Discover and listen to radio stations from around the world</CardDescription>
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
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Min Bitrate (kbps)</label>
                                            <Input
                                                type="number"
                                                value={filters.bitrateMin || ''}
                                                onChange={(e) =>
                                                    handleFilterChange('bitrateMin', parseInt(e.target.value) || 0)
                                                }
                                                placeholder="Min bitrate"
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Max Bitrate (kbps)</label>
                                            <Input
                                                type="number"
                                                value={filters.bitrateMax || ''}
                                                onChange={(e) =>
                                                    handleFilterChange('bitrateMax', parseInt(e.target.value) || 0)
                                                }
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
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'top' | 'search')}>
                    <div className="flex flex-col lg:flex-row items-center justify-between mb-4">
                        <TabsList>
                            <TabsTrigger value="top" onClick={resetSearch}>
                                <Headphones className="w-4 h-4 mr-2" />
                                Top Stations
                            </TabsTrigger>
                            <TabsTrigger value="search" disabled={!isSearchMode}>
                                <Search className="w-4 h-4 mr-2" />
                                Search Results
                            </TabsTrigger>
                        </TabsList>

                        <div className="flex gap-2">
                            {activeTab === 'top' && (
                                <Button
                                    onClick={() => refetchTop()}
                                    size="sm"
                                    variant="outline"
                                    disabled={isLoadingTop}
                                >
                                    <RefreshCw className={`w-4 h-4 mr-2 ${isLoadingTop ? 'animate-spin' : ''}`} />
                                    Refresh
                                </Button>
                            )}
                        </div>
                    </div>

                    <Separator className="my-4" />

                    <TabsContent value="top" className="mt-0">
                        {isTopError && (
                            <div className="p-4 bg-destructive/10 text-destructive rounded-lg mb-6">
                                Failed to load top radio stations. Please try again.
                            </div>
                        )}

                        {isLoadingTop ? (
                            <StationGridSkeleton />
                        ) : (
                            <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {topStations.map((station, index) => (
                                    <APIStationCard
                                        key={'id' in station ? station.id : `station-${index}`}
                                        station={station as Station}
                                    />
                                ))}
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="search" className="mt-0">
                        {isSearchError && (
                            <div className="p-4 bg-destructive/10 text-destructive rounded-lg mb-6">
                                Failed to load search results. Please try again.
                            </div>
                        )}

                        {isSearchLoading ? (
                            <StationGridSkeleton />
                        ) : (
                            <>
                                {searchResults.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-12 text-center">
                                        <Radio className="h-12 w-12 text-muted-foreground mb-4" />
                                        <h3 className="text-xl font-medium mb-2">No stations found</h3>
                                        <p className="text-muted-foreground max-w-md">
                                            Try adjusting your search terms or filters to find more radio stations.
                                        </p>
                                    </div>
                                ) : (
                                    <div
                                        ref={gridRef}
                                        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 bg-black gap-6"
                                    >
                                        {searchResults.map((station, index) => (
                                            <APIStationCard
                                                key={'id' in station ? station.id : `station-${index}`}
                                                station={station as Station}
                                            />
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    )
}

function StationGridSkeleton() {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex flex-col space-y-3">
                    <Skeleton className="h-40 w-full rounded-lg" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                </div>
            ))}
        </div>
    )
}
