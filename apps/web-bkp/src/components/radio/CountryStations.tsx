import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useStationsByCountry } from '@/hooks/useRadioBrowser'
import type { Station } from '@wavefunc/common/types'
import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { RadioStationCard } from './RadioStationCard'

const COUNTRIES = [
    { code: 'US', name: 'United States' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'DE', name: 'Germany' },
    { code: 'FR', name: 'France' },
    { code: 'CA', name: 'Canada' },
    { code: 'AU', name: 'Australia' },
    { code: 'JP', name: 'Japan' },
    { code: 'BR', name: 'Brazil' },
    { code: 'ES', name: 'Spain' },
    { code: 'IT', name: 'Italy' },
]

export function CountryStations() {
    const [selectedCountry, setSelectedCountry] = useState('US')

    const { data: stationsData = [], isLoading, refetch, isError } = useStationsByCountry(selectedCountry, 15, true)

    const stations = stationsData as Station[]

    const handleCountryChange = (value: string) => {
        setSelectedCountry(value)
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-semibold">Radio Stations by Country</h2>
                <div className="flex gap-2">
                    <Select value={selectedCountry} onValueChange={handleCountryChange}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Select country" />
                        </SelectTrigger>
                        <SelectContent>
                            {COUNTRIES.map((country) => (
                                <SelectItem key={country.code} value={country.code}>
                                    {country.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button onClick={() => refetch()} size="sm" variant="outline" disabled={isLoading}>
                        <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </div>
            </div>

            {isError && (
                <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
                    Failed to load stations. Please try again.
                </div>
            )}

            {isLoading ? (
                <div className="flex justify-center items-center p-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
            ) : stations.length === 0 ? (
                <div className="p-4 bg-muted/50 text-muted-foreground rounded-lg text-center">
                    No stations found for this country. Try another one!
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {stations.map((station) => (
                        <RadioStationCard key={station.id} station={station} />
                    ))}
                </div>
            )}
        </div>
    )
}
