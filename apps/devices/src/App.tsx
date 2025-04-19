import NDK, { NDKEvent, NDKSubscription } from '@nostr-dev-kit/ndk'
import {
    cn,
    parseRadioEvent,
    RADIO_EVENT_KINDS,
    RadioPlayer,
    subscribeToRadioStations,
    type Station,
} from '@wavefunc/common'
import StationGrid from '@wavefunc/common/src/components/station/StationGrid'
import { Button } from '@wavefunc/ui/components/ui/button'
import '@wavefunc/ui/index.css' // Ensure styles are imported
import { useEffect, useMemo, useState } from 'react'
import { useMedia } from 'react-use'

// Replicated GenreSelector component
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

function App() {
    const [ndk, setNdk] = useState<NDK | null>(null)
    const [stations, setStations] = useState<Station[]>([])
    const [deletedStationIds, setDeletedStationIds] = useState<Set<string>>(new Set())
    const [selectedGenre, setSelectedGenre] = useState<string | null>(null)
    // const [currentUser, setCurrentUser] = useState<NDKUser | null>(null) // Keep if needed for future use
    const isMobile = useMedia('(max-width: 640px)')

    // Initialize NDK
    useEffect(() => {
        const ndkInstance = new NDK({
            // Replace with your desired relays for the devices app
            explicitRelayUrls: ['wss://relay.damus.io', 'wss://relay.primal.net', 'wss://relay.wavefunc.live'],
            // Add signer if needed for user actions
        })
        setNdk(ndkInstance)
        ndkInstance
            .connect()
            .then(() => console.log('NDK connected for devices app'))
            .catch((error) => console.error('NDK connection error:', error))

        return () => {
            // NDK doesn't have a disconnect method. Subscriptions are stopped elsewhere.
            // ndkInstance.disconnect();
            console.log('NDK cleanup (subscriptions stopped elsewhere)')
        }
    }, [])

    // Subscribe to deleted station events (kind 5)
    useEffect(() => {
        if (!ndk) return

        const sub = ndk.subscribe({ kinds: [5] }, { closeOnEose: false })

        sub.on('event', (event: NDKEvent) => {
            const deletedIds = event.tags.filter((tag) => tag[0] === 'e').map((tag) => tag[1])

            if (deletedIds.length > 0) {
                setDeletedStationIds((prev) => {
                    const newSet = new Set(prev)
                    deletedIds.forEach((id) => newSet.add(id))
                    return newSet
                })
                setStations((prev) => prev.filter((station) => !deletedIds.includes(station.id)))
            }
        })

        // Store subscription to stop it on cleanup
        const subscription = sub
        return () => {
            subscription.stop()
        }
    }, [ndk])

    // Process an incoming station event
    const processStationEvent = (event: NDKEvent) => {
        if (deletedStationIds.has(event.id)) return

        const dTag = event.tags.find((t) => t[0] === 'd')
        if (!dTag?.[1]) return // Ensure dTag and its value exist

        let naddr = ''
        try {
            // Assuming RADIO_EVENT_KINDS.STREAM is correctly defined in @wavefunc/common
            naddr = `${RADIO_EVENT_KINDS.STREAM}:${event.pubkey}:${dTag[1]}`
        } catch (e) {
            console.error('Error creating naddr:', e)
            return
        }

        try {
            const data = parseRadioEvent(event)
            const station: Station = {
                id: event.id,
                naddr,
                name: data.name || dTag[1] || 'Unnamed Station', // Fallback name
                description: data.description || '',
                website: data.website || '',
                genre: event.tags.find((t) => t[0] === 'genre')?.[1] || '',
                imageUrl: event.tags.find((t) => t[0] === 'thumbnail')?.[1] || '',
                pubkey: event.pubkey,
                tags: event.tags,
                streams: data.streams || [], // Ensure streams is an array
                created_at: event.created_at || Math.floor(Date.now() / 1000),
            }

            setStations((prev) => {
                const existingIndex = prev.findIndex((s) => s.naddr === station.naddr) // Use naddr for uniqueness

                if (existingIndex >= 0) {
                    const existingStation = prev[existingIndex]
                    if (existingStation.created_at < station.created_at) {
                        const updated = [...prev]
                        updated[existingIndex] = station
                        // Keep sorting consistent
                        return updated.sort((a, b) => b.created_at - a.created_at)
                    }
                    // If existing station is newer or same age, do nothing
                    return prev
                } else {
                    // Add the new station and sort
                    return [...prev, station].sort((a, b) => b.created_at - a.created_at)
                }
            })
        } catch (error) {
            console.warn(`Failed to parse station event ${event.id}:`, error)
        }
    }

    // Subscribe to radio station events
    useEffect(() => {
        if (!ndk) return

        const processedEvents = new Set<string>()

        const handleEvent = (event: NDKEvent) => {
            if (processedEvents.has(event.id)) return
            processedEvents.add(event.id)
            processStationEvent(event)
        }

        // Use type assertion if necessary due to potential NDK version conflicts
        // Make sure subscribeToRadioStations is correctly typed or adjust handleEvent signature
        // @ts-ignore TODO: Fix this
        const sub: NDKSubscription = subscribeToRadioStations(ndk as any, handleEvent as any)

        return () => {
            sub.stop()
        }
        // Pass processStationEvent and deletedStationIds to dependency array if needed,
        // but careful with re-subscriptions. NDK instance change is the main trigger.
    }, [ndk, deletedStationIds]) // Re-run if NDK changes or deleted IDs change

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
        // Use container and padding similar to web app if desired
        <main className="container mx-auto px-4 sm:px-6 lg:px-8 flex flex-col gap-6 my-6 max-w-full">
            <h1 className={cn('font-bold mb-3', isMobile ? 'text-xl' : 'text-2xl md:text-3xl')}>Discover Stations</h1>

            <GenreSelector
                genres={genres}
                selectedGenre={selectedGenre}
                onSelectGenre={setSelectedGenre}
                isMobile={isMobile}
            />

            {/* Render StationGrid only when stations data is available */}
            {stations.length > 0 ? (
                <StationGrid stations={filteredStations} isMobile={isMobile} />
            ) : (
                <p>Loading stations...</p> // Or some loading indicator
            )}
            <RadioPlayer />
        </main>
    )
}

export default App
