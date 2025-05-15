import { useAutoAnimate } from '@formkit/auto-animate/react'
import { useStore } from '@tanstack/react-store'
import { useMemo, useState } from 'react'
import { useMedia } from 'react-use'

// UI Components
import { Button } from '@wavefunc/ui/components/ui/button'
import { Card, CardContent, CardFooter } from '@wavefunc/ui/components/ui/card'
import { StreamSelector } from './StreamSelector'

// Icons
import { Plus } from 'lucide-react'

// Stores and utilities
import type { Station } from '@wavefunc/common'
import {
    cn,
    getStationBackgroundColor,
    openEditStationDrawer,
    playStation,
    stationsStore,
    togglePlayback,
} from '@wavefunc/common'
import type { Stream } from '@wavefunc/common/src/types/stream'
import { PlayButton } from './station-card/PlayButton'
import { StationHeader } from './station-card/StationHeader'
import { StationImage } from './station-card/StationImage'
import { StationTags } from './station-card/StationTags'

// Station main content component
interface StationContentProps {
    station: Station
    stationTags: string[]
    isMobile: boolean
}

const StationContent = ({ station, stationTags, isMobile }: StationContentProps) => (
    <CardContent className={cn(isMobile ? 'p-2 pt-0' : 'p-4 pt-0 pb-2', 'flex-grow flex flex-col')}>
        <div className="flex-grow">
            <p className={cn('line-clamp-2', isMobile ? 'text-[8px]' : 'text-xs')}>{station.description}</p>

            <StationTags tags={stationTags} isMobile={isMobile} />
        </div>

        <div className="mt-auto pt-2 flex items-center justify-between">
            {station.streams && Array.isArray(station.streams) && station.streams.length > 0 && (
                <div className="text-xs text-muted-foreground line-clamp-1">
                    <span className="font-press-start-2p">
                        {station.streams.find((s) => s.primary)?.quality?.bitrate ||
                            station.streams[0]?.quality?.bitrate ||
                            'Unknown'}{' '}
                        kbps
                    </span>
                </div>
            )}
        </div>
    </CardContent>
)

interface APIStationCardProps {
    station: Station
}

export default function APIStationCard({ station }: APIStationCardProps) {
    const isMobile = useMedia('(max-width: 640px)')

    // Initialize selectedStreamId with the primary stream or first stream
    const initialStreamId = useMemo(() => {
        if (!station.streams || !Array.isArray(station.streams) || station.streams.length === 0) {
            return undefined
        }

        // Try to find the primary stream first
        const primaryStream = station.streams.find((stream) => stream.primary === true)
        if (primaryStream?.quality?.bitrate) {
            return primaryStream.quality.bitrate
        }

        // Fall back to the first stream
        return station.streams[0]?.quality?.bitrate
    }, [station.streams])

    const [selectedStreamId, setSelectedStreamId] = useState<number | undefined>(initialStreamId)

    const isPlaying = useStore(stationsStore, (state) => state.isPlaying)
    const currentStation = useStore(stationsStore, (state) => state.currentStation)
    const isCurrentlyPlaying = currentStation?.id === station.id && isPlaying

    const [cardRef] = useAutoAnimate<HTMLDivElement>({
        duration: 300,
        easing: 'ease-in-out',
    })

    // Generate background color based on station name
    const cardBackgroundColor = useMemo(() => getStationBackgroundColor(station.name || '', 0.9), [station.name])

    // Stream handler
    const handleStreamSelect = (stream: Stream) => {
        if (stream && stream.quality && stream.quality.bitrate) {
            setSelectedStreamId(stream.quality.bitrate)
            console.log(`Selected stream quality: ${stream.quality.bitrate} kbps`)
        }
    }

    // Play/Pause handler
    const handlePlay = () => {
        console.log('handlePlay', station.name, station.streams)
        if (!station.streams?.length) {
            console.log('No streams available for this station')
            return
        }

        try {
            // Find the selected stream by bitrate
            const selectedStream =
                station.streams.find((s) => s.quality?.bitrate === selectedStreamId) ||
                station.streams.find((s) => s.primary === true) ||
                station.streams[0]

            console.log('Selected stream:', selectedStream)
            console.log(`Stream quality: ${selectedStream?.quality?.bitrate} kbps, Format: ${selectedStream?.format}`)

            if (selectedStream) {
                // If this is the current station, just toggle playback
                if (currentStation?.id === station.id) {
                    console.log('Toggling playback for current station')
                    togglePlayback()
                } else {
                    // If this is a new station, set it as current and ensure playback starts
                    console.log('Playing new station')
                    playStation({
                        ...station,
                        streams: [selectedStream],
                    })
                }
            }
        } catch (error) {
            console.error('Error in handlePlay:', error)
        }
    }

    // Add to Nostr handler
    const handleAddToNostr = () => {
        openEditStationDrawer(station)
    }

    // Extract tags from station
    const stationTags = useMemo(() => {
        if (!station.tags || !Array.isArray(station.tags)) {
            return []
        }
        return station.tags
            .filter((tag) => tag[0] === 't') // Only keep 't' tags which are actual content/genre tags
            .map((tag) => tag[1])
            .filter(Boolean)
    }, [station.tags])

    const hasStreams = station.streams && Array.isArray(station.streams) && station.streams.length > 0

    return (
        <Card
            ref={cardRef}
            className="transition-all duration-300 overflow-hidden flex flex-col relative p-2 h-full h-[200px]"
            style={{ backgroundColor: cardBackgroundColor }}
        >
            <PlayButton
                className="absolute top-2 right-2 z-30"
                isCurrentlyPlaying={isCurrentlyPlaying}
                handlePlay={handlePlay}
                hasStreams={hasStreams}
                isMobile={isMobile}
                isFullWidth={false}
            />

            <div className="flex flex-col h-full">
                <div className="flex flex-row justify-between flex-grow">
                    {/* Station image */}
                    <StationImage station={station} isFullWidth={false} isMobile={isMobile} />

                    {/* Content section */}
                    <div className="grow min-w-0 flex flex-col h-full">
                        {/* Header with station name and stream selector */}
                        <StationHeader
                            station={station}
                            existsInNostr={null}
                            stationNaddr={null}
                            checkingNostr={false}
                            isMobile={isMobile}
                            isFullWidth={false}
                            streams={station.streams}
                            selectedStreamId={selectedStreamId}
                            handleStreamSelect={handleStreamSelect}
                        />

                        {/* Main content with description and tags */}
                        <StationContent station={station} stationTags={stationTags} isMobile={isMobile} />

                        {/* Footer with Add to Nostr button */}
                        <CardFooter
                            className={cn(
                                'flex justify-between gap-1 mt-auto',
                                isMobile ? 'p-2 pt-2 flex-col items-start' : 'p-4 pt-2 pb-2 flex-row-reverse',
                            )}
                        >
                            <div
                                className={cn(
                                    'flex items-center',
                                    isMobile ? 'w-full justify-between mt-1' : 'space-x-1',
                                )}
                            >
                                <Button
                                    onClick={handleAddToNostr}
                                    variant="ghost"
                                    size="sm"
                                    className={cn('h-7', isMobile ? 'px-2 text-[10px] w-full' : 'px-1')}
                                >
                                    <Plus className="h-3 w-3 mr-1" />
                                    <span className={cn(isMobile ? 'text-[10px]' : 'text-xs')}>Add to Nostr</span>
                                </Button>
                            </div>

                            <div
                                className={cn(
                                    'flex items-center',
                                    isMobile ? 'w-full justify-between mt-1' : 'space-x-2',
                                )}
                            >
                                {/* Stream quality selector (mobile only) */}
                                {isMobile && hasStreams && station.streams.length > 1 && (
                                    <div className="shrink-0 w-20">
                                        {station.id && !isNaN(Number(station.id)) && (
                                            <StreamSelector
                                                stationId={Number(station.id)}
                                                onStreamSelect={handleStreamSelect}
                                                selectedStreamId={selectedStreamId}
                                                streams={station.streams}
                                            />
                                        )}
                                    </div>
                                )}
                            </div>
                        </CardFooter>
                    </div>
                </div>
            </div>
        </Card>
    )
}
