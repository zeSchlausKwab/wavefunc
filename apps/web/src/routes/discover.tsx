import { RadioCard } from '@/components/radio/RadioCard'
import { Button } from '@/components/ui/button'
import { ndkActions } from '@/lib/store/ndk'
import { cn } from '@/lib/utils'
import { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk'
import { createFileRoute } from '@tanstack/react-router'
import { parseRadioEvent, RADIO_EVENT_KINDS, subscribeToRadioStations, type Station } from '@wavefunc/common'
import { useEffect, useState, useMemo } from 'react'
import { useMedia } from 'react-use'

// Custom hook to fetch the current user
function useCurrentUser() {
    const [currentUser, setCurrentUser] = useState<NDKUser | null>(null)

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const ndk = ndkActions.getNDK()
                if (!ndk) return

                const user = await ndk.signer?.user()
                if (user) {
                    setCurrentUser(user)
                }
            } catch (error) {
                console.error('Error fetching user:', error)
            }
        }

        fetchUser()
    }, [])

    return currentUser
}

// Custom hook to manage radio stations
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

        sub.on('event', (event: NDKEvent) => {
            const deletedIds = event.tags.filter((tag) => tag[0] === 'e').map((tag) => tag[1])

            if (deletedIds.length > 0) {
                // Update deleted IDs set
                setDeletedStationIds((prev) => {
                    const newSet = new Set(prev)
                    deletedIds.forEach((id) => newSet.add(id))
                    return newSet
                })

                // Remove deleted stations from the list
                setStations((prev) => prev.filter((station) => !deletedIds.includes(station.id)))
            }
        })

        return () => {
            sub.stop()
        }
    }, [])

    // Process an incoming station event
    const processStationEvent = (event: NDKEvent) => {
        // Skip processing if the event is already deleted
        if (deletedStationIds.has(event.id)) {
            return
        }

        // Extract the d-tag which identifies the station
        const dTag = event.tags.find((t) => t[0] === 'd')
        if (!dTag) {
            return
        }

        // Generate the naddr (Nostr address) for the station
        let naddr = ''
        try {
            naddr = `${RADIO_EVENT_KINDS.STREAM}:${event.pubkey}:${dTag[1]}`
        } catch (e) {
            return
        }

        try {
            // Parse the radio event data
            const data = parseRadioEvent(event)

            // Create a station object
            const station: Station = {
                id: event.id,
                naddr,
                name: data.name,
                description: data.description,
                website: data.website,
                genre: event.tags.find((t) => t[0] === 'genre')?.[1] || '',
                imageUrl: event.tags.find((t) => t[0] === 'thumbnail')?.[1] || '',
                pubkey: event.pubkey,
                tags: event.tags,
                streams: data.streams,
                created_at: event.created_at || Math.floor(Date.now() / 1000),
            }

            // Update the stations list, replacing any existing station with the same ID
            // or adding a new one
            setStations((prev) => {
                const existingIndex = prev.findIndex((s) => s.id === station.id)

                // If we already have this station, check if the new one is newer
                if (existingIndex >= 0) {
                    const existingStation = prev[existingIndex]

                    // Only update if the new station is newer
                    if (existingStation.created_at < station.created_at) {
                        const updated = [...prev]
                        updated[existingIndex] = station
                        return updated.sort((a, b) => b.created_at - a.created_at)
                    }

                    return prev
                }

                // Add the new station and re-sort
                return [...prev, station].sort((a, b) => b.created_at - a.created_at)
            })
        } catch (error) {
            // Ignore parsing errors
            console.warn('Failed to parse station:', error)
        }
    }

    // Subscribe to radio station events
    useEffect(() => {
        const ndk = ndkActions.getNDK()
        if (!ndk) return

        // Use a Set to track processed event IDs within this component
        const processedEvents = new Set<string>()

        // Use any type for the event to avoid version incompatibility issues
        const handleEvent: any = (event: any) => {
            // Skip processing if we've already handled this event
            if (processedEvents.has(event.id)) {
                return
            }

            // Mark the event as processed
            processedEvents.add(event.id)

            // Process the station event
            processStationEvent(event)
        }

        // Use type assertion to resolve the NDK version incompatibility
        const sub = subscribeToRadioStations(ndk as any, handleEvent)

        return () => {
            sub.stop()
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
        <div className="mb-4 overflow-x-auto pb-1 scrollbar-hide">
            <div className="flex flex-nowrap gap-1">
                <Button
                    variant={selectedGenre === null ? 'default' : 'outline'}
                    size={isMobile ? 'sm' : 'default'}
                    onClick={() => onSelectGenre(null)}
                    className={cn(
                        'rounded-md whitespace-nowrap min-w-max',
                        isMobile ? 'text-xs py-1 px-2 h-7' : 'py-1 px-3',
                    )}
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
                            'rounded-md whitespace-nowrap min-w-max',
                            isMobile ? 'text-xs py-1 px-2 h-7' : 'py-1 px-3',
                        )}
                    >
                        {genre}
                    </Button>
                ))}
            </div>
        </div>
    )
}

// Station grid component
function StationGrid({ stations, isMobile }: { stations: Station[]; isMobile: boolean }) {
    return (
        <div className={cn('grid md:grid-cols-1 lg:grid-cols-2', isMobile ? 'gap-2' : 'gap-3 md:gap-6')}>
            {stations.map((station) => (
                <RadioCard key={station.id} station={station} />
            ))}

            {stations.length === 0 && (
                <div className={cn('text-center py-8 text-gray-500', isMobile ? 'text-sm' : 'text-base')}>
                    No stations found
                </div>
            )}
        </div>
    )
}

export const Route = createFileRoute('/discover')({
    component: Discover,
})

function Discover() {
    const [selectedGenre, setSelectedGenre] = useState<string | null>(null)
    const isMobile = useMedia('(max-width: 640px)')

    // Get the current user
    const currentUser = useCurrentUser()

    // Get all radio stations
    const { stations } = useRadioStations()

    // Extract unique genres from stations
    const genres = useMemo(() => {
        return Array.from(
            new Set(
                stations.flatMap((station) =>
                    station.genre
                        ? station.genre
                              .split(',')
                              .map((g) => g.trim())
                              .filter(Boolean)
                        : [],
                ),
            ),
        ).sort((a, b) => a.localeCompare(b))
    }, [stations])

    // Filter stations by selected genre
    const filteredStations = useMemo(() => {
        if (!selectedGenre) return stations

        return stations.filter((station) => {
            if (!station.genre) return false
            const stationGenres = station.genre.split(',').map((g) => g.trim())
            return stationGenres.includes(selectedGenre)
        })
    }, [stations, selectedGenre])

    return (
        <div className={cn('container mx-auto', isMobile ? 'px-2 py-2' : 'p-6')}>
            <h1 className={cn('font-bold font-press-start-2p mb-3', isMobile ? 'text-xl' : 'text-2xl md:text-3xl')}>
                Discover
            </h1>

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
