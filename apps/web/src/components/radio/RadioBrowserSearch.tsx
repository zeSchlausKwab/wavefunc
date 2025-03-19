import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { openEditStationDrawer } from '@/lib/store/ui'
import type { Station, RadioBrowserParams } from '@wavefunc/common/types'
import { useSearchStations } from '@/hooks/useRadioBrowser'
import { Filter, Link as LinkIcon, Search } from 'lucide-react'
import { useState } from 'react'
import { RadioStationCard } from './RadioStationCard'

interface SearchFilters {
    name: string
    countrycode: string
    language: string
    tag: string
    codec: string
    bitrateMin: number
    bitrateMax: number
}

export function RadioBrowserSearch() {
    const [searchQuery, setSearchQuery] = useState('')
    const [showFilters, setShowFilters] = useState(false)
    const [filters, setFilters] = useState<SearchFilters>({
        name: '',
        countrycode: 'all',
        language: 'all',
        tag: '',
        codec: 'all',
        bitrateMin: 0,
        bitrateMax: 0,
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

    const { data: stations = [], isLoading, refetch, isError } = useSearchStations(getSearchParams(), false)

    const searchStations = () => {
        refetch()
    }

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            searchStations()
        }
    }

    const handleFilterChange = (key: keyof SearchFilters, value: string | number) => {
        setFilters((prev) => ({ ...prev, [key]: value }))
    }

    // Group stations by name for display
    const groupedStations = Object.values(
        (stations as Station[]).reduce(
            (acc, station) => {
                const key = station.name.toLowerCase()
                if (!acc[key]) {
                    acc[key] = []
                }
                acc[key].push(station)
                return acc
            },
            {} as Record<string, Station[]>,
        ),
    )

    return (
        <div className="space-y-6">
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
                <div className="space-y-8">
                    {groupedStations.map((stationGroup, groupIndex) => (
                        <div key={groupIndex} className="space-y-4">
                            {stationGroup.length > 1 && (
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <LinkIcon className="w-4 h-4" />
                                        <span>{stationGroup.length} similar stations found</span>
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            openEditStationDrawer(stationGroup[0])
                                        }}
                                    >
                                        <LinkIcon className="w-4 h-4 mr-2" />
                                        Unify All Streams
                                    </Button>
                                </div>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {stationGroup.map((station) => (
                                    <RadioStationCard key={station.id} station={station} />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
