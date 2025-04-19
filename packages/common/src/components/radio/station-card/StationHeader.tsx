import { CardDescription, CardHeader, CardTitle } from '@wavefunc/ui/components/ui/card'
import { cn } from '@wavefunc/common'
import { NDKEvent } from '@nostr-dev-kit/ndk'
import { Link as RouterLink } from '@tanstack/react-router'
import type { Station } from '@wavefunc/common'
import type { Stream } from '@wavefunc/common/types/stream'
import { CheckCircle2, CircleDashed, ExternalLink } from 'lucide-react'
import { StreamSelector } from '../StreamSelector'

// Station header component
interface StationHeaderProps {
    station: Station
    existsInNostr: NDKEvent | null
    stationNaddr: string | null
    checkingNostr: boolean
    isMobile: boolean
    isFullWidth: boolean
    streams?: Stream[]
    selectedStreamId?: number
    handleStreamSelect: (stream: Stream) => void
}

export const StationHeader = ({
    station,
    existsInNostr,
    stationNaddr,
    checkingNostr,
    isMobile,
    isFullWidth,
    streams,
    selectedStreamId,
    handleStreamSelect,
}: StationHeaderProps) => (
    <CardHeader className={cn(isMobile ? 'p-2' : 'p-4 pb-2')}>
        <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                    {existsInNostr && stationNaddr ? (
                        <RouterLink
                            to="/station/$naddr"
                            params={{ naddr: stationNaddr }}
                            className="hover:underline flex items-center gap-1"
                        >
                            <CardTitle
                                className={cn(
                                    'truncate text-primary',
                                    isMobile ? 'text-xs' : 'text-sm',
                                    'font-heading',
                                )}
                            >
                                {station.name}
                            </CardTitle>
                            <ExternalLink className="w-3 h-3 text-primary" />
                        </RouterLink>
                    ) : (
                        <CardTitle
                            className={cn('truncate text-primary', isMobile ? 'text-xs' : 'text-sm', 'font-heading')}
                        >
                            {station.name}
                        </CardTitle>
                    )}
                    {checkingNostr ? (
                        <CircleDashed className="w-4 h-4 animate-spin text-muted-foreground" />
                    ) : existsInNostr ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                    ) : null}
                </div>
                <CardDescription className={cn('mt-1 truncate', isMobile ? 'text-[8px]' : 'text-xs')}>
                    {station.genre}
                </CardDescription>
            </div>
            {/* Only show stream selector in header on desktop */}
            {!isFullWidth && !isMobile && streams && Array.isArray(streams) && streams.length > 1 && (
                <div className="shrink-0 w-24">
                    {station.id && !isNaN(Number(station.id)) ? (
                        <StreamSelector
                            stationId={Number(station.id)}
                            onStreamSelect={handleStreamSelect}
                            selectedStreamId={selectedStreamId}
                            streams={streams}
                        />
                    ) : null}
                </div>
            )}
        </div>
    </CardHeader>
)
