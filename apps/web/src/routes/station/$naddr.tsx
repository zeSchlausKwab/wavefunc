import { StreamSelector } from '@/components/radio/StreamSelector'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { nostrService } from '@/lib/services/ndk'
import { setCurrentStation, stationsStore, togglePlayback } from '@/lib/store/stations'
import { openEditStationDrawer } from '@/lib/store/ui'
import type { Station } from '@wavefunc/common'
import { decodeStationNaddr } from '@wavefunc/common'
import type { Stream } from '@wavefunc/common/types/stream'
import type { NDKEvent } from '@nostr-dev-kit/ndk'
import { NDKUser } from '@nostr-dev-kit/ndk'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import {
    AlertCircle,
    Calendar,
    ChevronLeft,
    Heart,
    Loader2,
    MessageCircle,
    Music,
    Pencil,
    Play,
    Share2,
    Zap,
} from 'lucide-react'
import React from 'react'
import CommentsList from '@/components/comments/CommentsList'

async function fetchStation(naddr: string): Promise<Station> {
    const ndk = nostrService.getNDK()
    if (!ndk) {
        throw new Error('NDK instance not available')
    }

    try {
        const nadrData = decodeStationNaddr(naddr)
        const filter = {
            kinds: [nadrData.kind],
            authors: [nadrData.pubkey],
            '#d': [nadrData.identifier],
        }

        let attempts = 0
        let events

        while (attempts < 3) {
            try {
                const timeout = attempts === 0 ? 3000 : 8000
                const fetchPromise = ndk.fetchEvents(filter)
                const fetchTimeoutPromise = new Promise<Set<NDKEvent>>((_, reject) =>
                    setTimeout(() => reject(new Error('Fetch events timeout')), timeout),
                )

                events = await Promise.race([fetchPromise, fetchTimeoutPromise])
                break
            } catch (err) {
                attempts++
                if (attempts >= 3) throw err
                await new Promise((resolve) => setTimeout(resolve, 1000))
            }
        }

        if (!events || events.size === 0) {
            throw new Error('No events found for this station')
        }

        let event: NDKEvent | undefined = events.values().next().value
        if (!event) {
            throw new Error('Station not found')
        }

        const content = JSON.parse(event.content)
        const nameTag = event.tags.find((tag) => tag[0] === 'name')
        const descriptionTag = event.tags.find((tag) => tag[0] === 'description')
        const genreTag = event.tags.find((tag) => tag[0] === 'genre')
        const thumbnailTag = event.tags.find((tag) => tag[0] === 'thumbnail')

        return {
            id: event.id,
            name: nameTag?.[1] || content.name,
            description: descriptionTag?.[1] || content.description,
            genre: genreTag?.[1] || '',
            website: content.website || '',
            imageUrl: thumbnailTag?.[1] || '',
            streams: content.streams || [],
            tags: event.tags,
            pubkey: event.pubkey,
            created_at: event.created_at || Math.floor(Date.now() / 1000),
        }
    } catch (error) {
        console.error('[Station] Error:', error)
        throw error
    }
}

export const Route = createFileRoute('/station/$naddr')({
    validateSearch: (search) => ({}),

    loader: async ({ params }) => {
        const { naddr } = params
        try {
            await nostrService.connect()
            return { naddr }
        } catch (error) {
            throw new Error(error instanceof Error ? error.message : 'Failed to connect to NDK')
        }
    },

    errorComponent: ({ error }) => {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'

        return (
            <div className="container mx-auto py-8 px-4">
                <div className="flex flex-col items-center justify-center min-h-[50vh]">
                    <AlertCircle className="h-10 w-10 text-destructive mb-4" />
                    <p className="text-destructive font-semibold">Error: {errorMessage}</p>
                    <Button asChild className="mt-6">
                        <Link to="/">Go Home</Link>
                    </Button>
                </div>
            </div>
        )
    },

    pendingComponent: () => (
        <div className="container mx-auto py-8 px-4">
            <div className="flex flex-col items-center justify-center min-h-[50vh]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="mt-4 text-muted-foreground">Loading station...</p>
            </div>
        </div>
    ),

    component: StationPage,
})

function StationPage() {
    const { naddr } = Route.useParams()
    const [user, setUser] = React.useState<NDKUser | null>(null)
    const [selectedStreamId, setSelectedStreamId] = React.useState<number | undefined>(undefined)
    const isPlaying = useStore(stationsStore, (state) => state.isPlaying)

    const {
        data: station,
        isLoading,
        error,
    } = useQuery({
        queryKey: ['station', naddr],
        queryFn: () => fetchStation(naddr),
        staleTime: 1000 * 60 * 5,
        retry: 3,
        retryDelay: 1000,
    })

    React.useEffect(() => {
        const getUser = async () => {
            if (station?.pubkey) {
                const user = await nostrService.getNDK()?.signer?.user()
                if (user) {
                    setUser(user)
                }
            }
        }
        getUser()
    }, [station?.pubkey])

    const handleStreamSelect = React.useCallback((stream: Stream) => {
        setSelectedStreamId(stream.quality.bitrate)
    }, [])

    const handlePlay = React.useCallback(() => {
        if (!station) return

        const selectedStream =
            station.streams.find((s) => s.quality.bitrate === selectedStreamId) ||
            station.streams.find((s) => s.primary) ||
            station.streams[0]

        if (selectedStream) {
            const stationToPlay = {
                ...station,
                streams: [selectedStream],
            }
            setCurrentStation(stationToPlay)
            if (!isPlaying) {
                togglePlayback()
            }
        }
    }, [station, selectedStreamId, isPlaying])

    const handleEdit = React.useCallback(() => {
        if (!station) return
        openEditStationDrawer(station)
    }, [station])

    if (isLoading) {
        return (
            <div className="container mx-auto py-8 px-4">
                <div className="flex flex-col items-center justify-center min-h-[50vh]">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="mt-4 text-muted-foreground">Loading station...</p>
                </div>
            </div>
        )
    }

    if (error || !station) {
        return (
            <div className="container mx-auto py-8 px-4">
                <div className="flex flex-col items-center justify-center min-h-[50vh]">
                    <AlertCircle className="h-10 w-10 text-destructive mb-4" />
                    <p className="text-destructive font-semibold">
                        Error: {error instanceof Error ? error.message : 'Failed to load station'}
                    </p>
                    <Button asChild className="mt-6">
                        <Link to="/">Go Home</Link>
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <div className="container mx-auto py-8 px-4">
            <div className="mb-6">
                <Button variant="ghost" className="flex items-center gap-2" asChild>
                    <Link to="/">
                        <ChevronLeft className="w-4 h-4" />
                        <span>Back to Home</span>
                    </Link>
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Left column - Station image and actions */}
                <div className="col-span-1">
                    <div className="rounded-lg overflow-hidden shadow-lg mb-4">
                        <img
                            src={station.imageUrl || '/placeholder-station.png'}
                            alt={station.name || 'Station'}
                            className="w-full h-64 object-cover"
                        />
                    </div>

                    <div className="flex flex-col space-y-4">
                        <div className="flex justify-between items-center">
                            <Button
                                onClick={handlePlay}
                                className="bg-primary hover:bg-primary/90 text-white font-semibold px-6 py-2 flex-1 mr-2"
                            >
                                <Play className="h-4 w-4 mr-2" />
                                Play Station
                            </Button>

                            {station.streams.length > 1 && (
                                <StreamSelector
                                    stationId={Number(station.id)}
                                    onStreamSelect={handleStreamSelect}
                                    selectedStreamId={selectedStreamId}
                                    streams={station.streams}
                                />
                            )}
                        </div>

                        <div className="flex justify-between">
                            <Button variant="outline" size="icon" aria-label="Zap">
                                <Zap className="h-4 w-4 text-primary" />
                            </Button>
                            <Button variant="outline" size="icon" aria-label="Like">
                                <Heart className="h-4 w-4 text-primary" />
                            </Button>
                            <Button variant="outline" size="icon" aria-label="Comment">
                                <MessageCircle className="h-4 w-4 text-primary" />
                            </Button>
                            <Button variant="outline" size="icon" aria-label="Share">
                                <Share2 className="h-4 w-4 text-primary" />
                            </Button>
                        </div>

                        {station.pubkey === user?.pubkey && (
                            <Button
                                onClick={handleEdit}
                                className="bg-secondary hover:bg-secondary-foreground text-primary hover:text-white font-press-start-2p text-xs"
                            >
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit Station
                            </Button>
                        )}
                    </div>
                </div>

                {/* Right column - Station details */}
                <div className="col-span-1 md:col-span-2">
                    <Card className="w-full bg-white bg-opacity-90 shadow-lg">
                        <CardHeader>
                            <CardTitle className="text-2xl font-press-start-2p text-primary">{station.name}</CardTitle>
                            <CardDescription className="text-sm font-press-start-2p mt-1">
                                {station.genre}
                            </CardDescription>
                        </CardHeader>

                        <CardContent>
                            <div className="space-y-6">
                                <div>
                                    <h3 className="text-sm font-bold mb-2">Description</h3>
                                    <p className="text-sm">{station.description}</p>
                                </div>

                                {station.website && (
                                    <div>
                                        <h3 className="text-sm font-bold mb-2">Website</h3>
                                        <a
                                            href={station.website}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-sm text-blue-500 hover:text-blue-700"
                                        >
                                            {station.website}
                                        </a>
                                    </div>
                                )}

                                <div className="flex items-center space-x-4">
                                    <div className="w-10 h-10 rounded-full bg-primary"></div>
                                    <div>
                                        <p className="text-sm font-semibold">{user?.profile?.name || 'Anonymous'}</p>
                                        <p className="text-xs text-gray-500">Station Creator</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="flex items-center">
                                        <Music className="h-4 w-4 text-primary mr-2" />
                                        <span className="text-xs">Streams: {station.streams.length}</span>
                                    </div>
                                    <div className="flex items-center">
                                        <Calendar className="h-4 w-4 text-primary mr-2" />
                                        <span className="text-xs">
                                            Created: {new Date(station.created_at * 1000).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="w-full bg-white bg-opacity-90 shadow-lg mt-6">
                        <CardHeader>
                            <CardTitle className="text-lg font-press-start-2p text-primary">
                                Available Streams
                            </CardTitle>
                        </CardHeader>

                        <CardContent>
                            {station.streams.length > 0 ? (
                                <div className="space-y-4">
                                    {station.streams.map((stream, index) => (
                                        <div key={index} className="flex justify-between items-center border-b pb-2">
                                            <div>
                                                <p className="font-medium">
                                                    {stream.url.split('/').pop() || `Stream ${index + 1}`}
                                                </p>
                                                <p className="text-xs text-gray-500">
                                                    {stream.quality.bitrate
                                                        ? `${stream.quality.bitrate}kbps`
                                                        : 'Unknown bitrate'}
                                                    {stream.quality.sampleRate && ` · ${stream.quality.sampleRate}kHz`}
                                                    {stream.primary && ' · Primary'}
                                                </p>
                                            </div>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleStreamSelect(stream)}
                                                className={
                                                    selectedStreamId === stream.quality.bitrate
                                                        ? 'bg-primary text-white'
                                                        : ''
                                                }
                                            >
                                                {selectedStreamId === stream.quality.bitrate ? 'Selected' : 'Select'}
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500">No streams available</p>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            <div className="mt-12 mb-8">
                <CommentsList stationId={station.id} stationEvent={station} />
            </div>
        </div>
    )
}
