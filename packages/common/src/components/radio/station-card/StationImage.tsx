import { cn } from '@wavefunc/common'
import type { Station } from '@wavefunc/common/types/station'

// Station image with play controls
interface StationImageProps {
    station: Station
    isFullWidth: boolean
    isMobile: boolean
}

export const StationImage = ({ station, isFullWidth, isMobile }: StationImageProps) => (
    <div
        className={cn(
            'relative shrink-0',
            isFullWidth ? (isMobile ? 'w-28 h-28' : 'w-64 h-64') : isMobile ? 'w-20 h-20' : 'w-32 h-32 m-2',
        )}
    >
        <img
            src={station.imageUrl || '/placeholder-station.png'}
            alt={station.name || 'Station'}
            className="w-full h-full object-cover rounded-md"
        />
    </div>
)
