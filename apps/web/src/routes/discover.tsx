import { NDKKind } from '@nostr-dev-kit/ndk'
import { createFileRoute } from '@tanstack/react-router'
import { cn, mapNostrEventToStation, ndkActions, RADIO_EVENT_KINDS, type Station } from '@wavefunc/common'
import StationGrid from '@wavefunc/common/src/components/station/StationGrid'
import { Button } from '@wavefunc/ui/components/ui/button'
import { useEffect, useMemo, useState } from 'react'
import { useMedia } from 'react-use'

function useRadioStations() {
    const [stations, setStations] = useState<Station[]>([])
    const [deletedStationIds, setDeletedStationIds] = useState<Set<string>>(new Set())

    // Subscribe to deleted station events (kind 5)
    useEffect(() => {
        const ndk = ndkActions.getNDK()
        if (!ndk) return

        const sub = ndk.subscribe(
            {
                kinds: [5],
            },
            { closeOnEose: false },
        )

        // Use a more generic handler that works with any NDK version
        sub.on('event', (event: any) => {
            try {
                // Work with raw event data to avoid version conflicts
                const rawEvent = event.rawEvent ? event.rawEvent() : event
                const deletedIds = rawEvent.tags
                    .filter((tag: string[]) => tag[0] === 'e')
                    .map((tag: string[]) => tag[1])

                if (deletedIds.length > 0) {
                    // Update deleted IDs set
                    setDeletedStationIds((prev) => {
                        const newSet = new Set(prev)
                        deletedIds.forEach((id: string) => newSet.add(id))
                        return newSet
                    })

                    // Remove deleted stations from the list
                    setStations((prev) => prev.filter((station) => !deletedIds.includes(station.id)))
                }
            } catch (error) {
                console.error('Error processing deletion event:', error)
            }
        })

        return () => {
            sub.stop()
        }
    }, [])

    // Process an incoming station event
    const processNewStationEvent = (event: any) => {
        try {
            // Use the mapNostrEventToStation function to get a complete Station object
            const station = mapNostrEventToStation(event)

            setStations((prevStations) => {
                // Check if we already have this station
                const exists = prevStations.some((s) => s.id === station.id)
                if (exists) return prevStations

                return [...prevStations, station]
            })
        } catch (e) {
            console.error('Error processing station event:', e)
        }
    }

    // Subscribe to radio station events
    useEffect(() => {
        const ndk = ndkActions.getNDK()
        if (!ndk) return

        // Use a Set to track processed event IDs within this component
        const processedEvents = new Set<string>()

        // Subscribe to radio stations but handle the callback manually to avoid type issues
        const filter = {
            kinds: [RADIO_EVENT_KINDS.STREAM as NDKKind],
        }

        // Create subscription without a callback
        const subscription = ndk.subscribe(filter, {
            closeOnEose: false,
        })

        // Add event handler separately to avoid the type mismatch in the function signature
        subscription.on('event', (event: any) => {
            // Get the raw event data which is compatible across NDK versions
            const rawEvent = event.rawEvent ? event.rawEvent() : event

            // Skip processing if we've already handled this event
            if (rawEvent && rawEvent.id && processedEvents.has(rawEvent.id)) {
                return
            }

            // Mark the event as processed if it has an ID
            if (rawEvent && rawEvent.id) {
                processedEvents.add(rawEvent.id)

                // Process using the raw event data
                processNewStationEvent(event)
            }
        })

        return () => {
            subscription.stop()
        }
    }, []) // Empty dependency array - only run once

    return {
        stations,
        deletedStationIds,
    }
}

// Genre selector component
function GenreSelector({
    genres,
    selectedGenre,
    onSelectGenre,
    isMobile,
}: {
    genres: string[]
    selectedGenre: string | null
    onSelectGenre: (genre: string | null) => void
    isMobile: boolean
}) {
    return (
        <div className="mb-4 max-w-full">
            <div className="overflow-x-auto pb-1 scrollbar-hide">
                <div className="flex flex-nowrap gap-1 w-max">
                    <Button
                        variant={selectedGenre === null ? 'default' : 'outline'}
                        size={isMobile ? 'sm' : 'default'}
                        onClick={() => onSelectGenre(null)}
                        className={cn('rounded-md whitespace-nowrap', isMobile ? 'text-xs py-1 px-2 h-7' : 'py-1 px-3')}
                    >
                        All
                    </Button>

                    {genres.map((genre) => (
                        <Button
                            key={genre}
                            variant={selectedGenre === genre ? 'default' : 'outline'}
                            size={isMobile ? 'sm' : 'default'}
                            onClick={() => onSelectGenre(genre)}
                            className={cn(
                                'rounded-md whitespace-nowrap',
                                isMobile ? 'text-xs py-1 px-2 h-7' : 'py-1 px-3',
                            )}
                        >
                            {genre}
                        </Button>
                    ))}
                </div>
            </div>
        </div>
    )
}

export const Route = createFileRoute('/discover')({
    component: Discover,
})

function Discover() {
    const [selectedGenre, setSelectedGenre] = useState<string | null>(null)
    const isMobile = useMedia('(max-width: 640px)')

    // Get all radio stations
    const { stations } = useRadioStations()

    // Extract unique genres from stations
    const genres = useMemo(() => {
        // Collect all t tags from all stations
        return Array.from(
            new Set(
                stations.flatMap((station) =>
                    station.tags
                        .filter((tag) => tag[0] === 't')
                        .map((tag) => tag[1])
                        .filter(Boolean),
                ),
            ),
        ).sort((a, b) => a.localeCompare(b))
    }, [stations])

    // Filter stations by selected genre
    const filteredStations = useMemo(() => {
        if (!selectedGenre) return stations

        console.log('stations', stations)

        return stations.filter((station) => {
            // Check if the station has the selected genre in its t tags
            return station.tags.some((tag) => tag[0] === 't' && tag[1] === selectedGenre)
        })
    }, [stations, selectedGenre])

    return (
        <div className="w-full flex flex-col gap-6 my-6 max-w-full">
            <h1 className={cn('font-bold mb-3', isMobile ? 'text-xl' : 'text-2xl md:text-3xl')}>Discover</h1>
            <GenreSelector
                genres={genres}
                selectedGenre={selectedGenre}
                onSelectGenre={setSelectedGenre}
                isMobile={isMobile}
            />
            <StationGrid stations={filteredStations} isMobile={isMobile} />
        </div>
    )
}
