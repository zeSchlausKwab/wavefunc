import { Button } from '@/components/ui/button'
import { useTopClickedStations } from '@/hooks/useRadioBrowser'
import type { Station } from '@wavefunc/common/types'
import { RefreshCw } from 'lucide-react'
import { RadioStationCard } from './RadioStationCard'

export function TopClickedStations() {
    const { data: stationsData = [], isLoading, refetch, isError } = useTopClickedStations(12, true)

    const stations = stationsData as Station[]

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-semibold">Top Clicked Stations</h2>
                <Button onClick={() => refetch()} size="sm" variant="outline" disabled={isLoading}>
                    <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            {isError && (
                <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
                    Failed to load top stations. Please try again.
                </div>
            )}

            {isLoading ? (
                <div className="flex justify-center items-center p-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
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
