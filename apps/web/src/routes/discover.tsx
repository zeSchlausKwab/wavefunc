import { useEffect, useState } from 'react'
import { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk'
import { nostrService } from '@/lib/services/ndk'
import { RelayDebugger } from '../components/debug/RelayDebugger'
import { subscribeToRadioStations, parseRadioEvent, RADIO_EVENT_KINDS, type Station } from '@wavefunc/common'
import { ExpandableStationCard } from '../components/station/ExpandableStationCard'
import { createFileRoute } from '@tanstack/react-router'
import { useMedia } from 'react-use'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/discover')({
    component: Discover,
})

function Discover() {
    const [stations, setStations] = useState<Station[]>([])
    const [currentUser, setCurrentUser] = useState<NDKUser | null>(null)
    const [deletedStationIds, setDeletedStationIds] = useState<Set<string>>(new Set())
    const [selectedGenre, setSelectedGenre] = useState<string | null>(null)
    const isMobile = useMedia('(max-width: 640px)')

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const user = await nostrService.getNDK().signer?.user()
                if (user) {
                    setCurrentUser(user)
                }
            } catch (error) {
                console.error('Error fetching user:', error)
            }
        }

        fetchUser()
    }, [])

    useEffect(() => {
        const ndk = nostrService.getNDK()
        const sub = ndk.subscribe(
            {
                kinds: [5],
            },
            { closeOnEose: false },
        )

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

        return () => {
            sub.stop()
        }
    }, [])

    useEffect(() => {
        const sub = subscribeToRadioStations(nostrService.getNDK(), (event: NDKEvent) => {
            if (deletedStationIds.has(event.id)) {
                return
            }

            setStations((prev) => {
                const dTag = event.tags.find((t) => t[0] === 'd')
                if (!dTag) {
                    console.warn('Received station without a d-tag, skipping:', event.id)
                    return prev
                }

                let naddr: string | undefined = undefined
                try {
                    naddr = `${RADIO_EVENT_KINDS.STREAM}:${event.pubkey}:${dTag[1]}`
                } catch (e) {
                    console.warn('Could not generate naddr identifier:', e)
                }

                const data = parseRadioEvent(event)
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

                const existingStationIndex = prev.findIndex((s) => {
                    if (s.id === event.id) return true

                    if (s.tags && dTag) {
                        const existingDTag = s.tags.find((t) => t[0] === 'd')
                        return existingDTag && existingDTag[1] === dTag[1] && s.pubkey === event.pubkey
                    }

                    return false
                })

                if (existingStationIndex >= 0) {
                    const newStations = [...prev]
                    newStations[existingStationIndex] = station
                    return newStations.sort((a, b) => b.created_at - a.created_at)
                } else {
                    return [...prev, station].sort((a, b) => b.created_at - a.created_at)
                }
            })
        })

        return () => {
            sub.stop()
        }
    }, [currentUser, deletedStationIds])

    const handleStationUpdate = (updatedStation: Station) => {
        setStations((prev) => prev.map((station) => (station.id === updatedStation.id ? updatedStation : station)))
    }

    const handleStationDelete = (stationId: string) => {
        setStations((prev) => prev.filter((station) => station.id !== stationId))

        setDeletedStationIds((prev) => {
            const newSet = new Set(prev)
            newSet.add(stationId)
            return newSet
        })
    }

    // Split each genre string at commas, flatten the array, and remove duplicates
    const genres = stations
        .flatMap((station) =>
            station.genre
                ? station.genre
                      .split(',')
                      .map((g) => g.trim())
                      .filter(Boolean)
                : [],
        )
        .filter((genre, index, self) => self.indexOf(genre) === index)
        .sort((a, b) => a.localeCompare(b))

    // Filter stations by selected genre, check if any comma-separated genre matches
    const filteredStations = selectedGenre
        ? stations.filter((station) => {
              if (!station.genre) return false
              const stationGenres = station.genre.split(',').map((g) => g.trim())
              return stationGenres.includes(selectedGenre)
          })
        : stations

    return (
        <div className={cn('container mx-auto', isMobile ? 'px-2 py-2' : 'p-6')}>
            <h1 className={cn('font-bold font-press-start-2p mb-3', isMobile ? 'text-xl' : 'text-2xl md:text-3xl')}>
                Discover
            </h1>

            <div className="mb-4 overflow-x-auto pb-1 scrollbar-hide">
                <div className="flex flex-nowrap gap-1">
                    <Button
                        variant={selectedGenre === null ? 'default' : 'outline'}
                        size={isMobile ? 'sm' : 'default'}
                        onClick={() => setSelectedGenre(null)}
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
                            onClick={() => setSelectedGenre(genre)}
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

            <div className={cn('grid grid-cols-1', isMobile ? 'gap-2' : 'gap-3 md:gap-6')}>
                {filteredStations.map((station) => (
                    <ExpandableStationCard
                        key={station.id}
                        station={station}
                        onUpdate={handleStationUpdate}
                        onDelete={handleStationDelete}
                    />
                ))}

                {filteredStations.length === 0 && (
                    <div className={cn('text-center py-8 text-gray-500', isMobile ? 'text-sm' : 'text-base')}>
                        No stations found
                    </div>
                )}
            </div>
            <RelayDebugger />
        </div>
    )
}
