import { cn } from '@wavefunc/common'
import type { Station } from '@wavefunc/common/src/types/station'
import { Radio } from 'lucide-react'
import { useState } from 'react'

// Station image with play controls
interface StationImageProps {
    station: Station
    isFullWidth: boolean
    isMobile: boolean
}

export const StationImage = ({ station, isFullWidth, isMobile }: StationImageProps) => {
    const [imageError, setImageError] = useState(false)
    const hasValidImage = station.imageUrl && !imageError

    return (
        <div
            className={cn(
                'relative shrink-0 bg-slate-100 rounded-md flex items-center justify-center',
                isFullWidth ? (isMobile ? 'w-28 h-28' : 'w-64 h-64') : isMobile ? 'w-20 h-20' : 'w-32 h-32 m-2',
            )}
        >
            {hasValidImage ? (
                <img
                    src={station.imageUrl}
                    alt={station.name || 'Station'}
                    className="w-full h-full object-cover rounded-md"
                    onError={() => setImageError(true)}
                />
            ) : (
                <Radio
                    className={cn(
                        'text-slate-400',
                        isFullWidth ? (isMobile ? 'w-12 h-12' : 'w-24 h-24') : isMobile ? 'w-10 h-10' : 'w-16 h-16',
                    )}
                />
            )}
        </div>
    )
}
