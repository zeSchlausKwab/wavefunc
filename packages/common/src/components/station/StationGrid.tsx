import { cn } from '@wavefunc/ui/lib/utils'
import type { Station } from '../..'
import RadioCard from '../radio/RadioCard'

// Station grid component
export default function StationGrid({ stations, isMobile }: { stations: Station[]; isMobile: boolean }) {
    return (
        <div className={cn('grid md:grid-cols-1 lg:grid-cols-3', isMobile ? 'gap-2' : 'gap-3 md:gap-12')}>
            {stations.map((station) => (
                <RadioCard key={station.id} station={station} naddr={station.naddr} />
            ))}

            {stations.length === 0 && (
                <div className={cn('text-center py-8 text-gray-500', isMobile ? 'text-sm' : 'text-base')}>
                    No stations found
                </div>
            )}
        </div>
    )
}
