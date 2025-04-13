import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { openEditStationDrawer } from '@/lib/store/ui'
import { setCurrentStation, stationsStore, togglePlayback } from '@/lib/store/stations'
import type { Station } from '@wavefunc/common'
import { findStationByNameInNostr, generateStationNaddr } from '@wavefunc/common'
import { useState, useEffect } from 'react'
import { Pause, Play, Plus, CircleDashed, CheckCircle2, ExternalLink } from 'lucide-react'
import { Link as RouterLink } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { ndkActions, ndkStore, useNDK } from '@/lib/store/ndk'

interface RadioStationCardProps {
    station: Station
}

export function RadioStationCard({ station }: RadioStationCardProps) {
    const [existsInNostr, setExistsInNostr] = useState(false)
    const [checkingNostr, setCheckingNostr] = useState(false)
    const [stationNaddr, setStationNaddr] = useState<string | null>(null)

    const isPlaying = useStore(stationsStore, (state) => state.isPlaying)
    const currentStation = useStore(stationsStore, (state) => state.currentStation)
    const isCurrentlyPlaying = currentStation?.id === station.id && isPlaying

    const { isConnected, ndk } = useStore(ndkStore)

    useEffect(() => {
        let isMounted = true

        if (!isConnected) return

        const checkNostr = async () => {
            if (!station.name) return

            try {
                setCheckingNostr(true)

                if (!ndk) {
                    throw new Error('NDK not initialized')
                }

                if (!isMounted) return

                const nostrEvent = await findStationByNameInNostr(ndk, station.name)
                if (!isMounted) return

                setExistsInNostr(!!nostrEvent)

                if (nostrEvent) {
                    try {
                        const naddr = generateStationNaddr(nostrEvent)
                        setStationNaddr(naddr)
                    } catch (error) {
                        console.error('Error generating naddr:', error)
                    }
                }
            } catch (error) {
                console.error('Error checking Nostr for station:', error)
            } finally {
                if (isMounted) {
                    setCheckingNostr(false)
                }
            }
        }

        checkNostr()

        return () => {
            isMounted = false
        }
    }, [station.name, isConnected])

    const handlePlayPause = () => {
        const primaryStream = station.streams.find((s) => s.primary) || station.streams[0]
        if (!primaryStream) return

        const stationToPlay = {
            ...station,
            streams: [primaryStream],
        }

        setCurrentStation(stationToPlay)

        if (currentStation?.id !== station.id || !isPlaying) {
            togglePlayback()
        }
    }

    const handleEditStation = () => {
        openEditStationDrawer(station)
    }

    return (
        <Card
            className={`hover:shadow-lg transition-shadow h-full ${existsInNostr ? 'border-green-500 border-2' : ''}`}
        >
            <CardContent className="p-4">
                <div className="flex items-start space-x-4">
                    <div className="relative w-16 h-16 shrink-0">
                        <img
                            src={station.imageUrl}
                            alt={station.name}
                            className="w-full h-full object-cover rounded-md"
                        />
                        <div className="absolute bottom-0 right-0 flex gap-1">
                            <Button
                                size="icon"
                                variant="secondary"
                                className="rounded-full w-8 h-8"
                                onClick={handlePlayPause}
                                disabled={!station.streams.length}
                            >
                                {isCurrentlyPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                            </Button>
                            <Button
                                size="icon"
                                variant="secondary"
                                className="rounded-full w-8 h-8"
                                onClick={handleEditStation}
                            >
                                <Plus className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                            {existsInNostr && stationNaddr ? (
                                <RouterLink
                                    to="/station/$naddr"
                                    params={{ naddr: stationNaddr }}
                                    className="hover:underline flex items-center gap-1"
                                >
                                    <h3 className="font-semibold text-primary font-press-start-2p truncate">
                                        {station.name}
                                    </h3>
                                    <ExternalLink className="w-3 h-3 text-primary" />
                                </RouterLink>
                            ) : (
                                <h3 className="font-semibold text-primary font-press-start-2p truncate">
                                    {station.name}
                                </h3>
                            )}
                            {checkingNostr ? (
                                <CircleDashed className="w-4 h-4 animate-spin text-muted-foreground" />
                            ) : existsInNostr ? (
                                <CheckCircle2 className="w-4 h-4 text-green-500" />
                            ) : null}
                        </div>
                        <p className="text-sm text-muted-foreground font-press-start-2p mt-1">{station.description}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {station.tags.slice(0, 3).map((tag, index) => (
                                <span key={index} className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                                    {tag[0]}
                                </span>
                            ))}
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground font-press-start-2p">
                            {station.streams.length > 0 && (
                                <>
                                    <p>
                                        Quality:{' '}
                                        {station.streams.find((s) => s.primary)?.quality?.bitrate ||
                                            station.streams[0].quality.bitrate}{' '}
                                        kbps
                                    </p>
                                    <p>
                                        Codec:{' '}
                                        {station.streams.find((s) => s.primary)?.quality?.codec ||
                                            station.streams[0].quality.codec}
                                    </p>
                                </>
                            )}
                            {station.website && (
                                <a
                                    href={station.website}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary hover:underline mt-1 block"
                                >
                                    Visit Website
                                </a>
                            )}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
