import { createFileRoute } from '@tanstack/react-router'
import { ndkActions, parseRadioEventWithSchema, RADIO_EVENT_KINDS, subscribeToRadioStations } from '@wavefunc/common'
import RadioCard from '@wavefunc/common/src/components/radio/RadioCard'
import type { Station } from '@wavefunc/common/src/types/station'
import { useEffect, useState, useMemo } from 'react'
// import { useMedia } from 'react-use'
export const Route = createFileRoute('/')({
    component: Index,
})

function Index() {
    const [stations, setStations] = useState<Station[]>([])
    const [selectedGenre, setSelectedGenre] = useState<string | null>(null)
    // const isMobile = useMedia('(max-width: 640px)')

    useEffect(() => {
        // Get NDK instance
        const ndk = ndkActions.getNDK()
        if (!ndk) return

        // Subscribe to radio station events using helper
        const subscription = subscribeToRadioStations(ndk, (event) => {
            try {
                const radioData = parseRadioEventWithSchema(event)

                const dTag = event.tags.find((t) => t[0] === 'd')?.[1] || ''

                const station: Station = {
                    id: event.id,
                    naddr: `${RADIO_EVENT_KINDS.STREAM}:${event.pubkey}:${dTag}`,
                    name: radioData.name,
                    description: radioData.description,
                    website: radioData.website,
                    imageUrl: event.tags.find((t) => t[0] === 'thumbnail')?.[1] || '',
                    countryCode: radioData.countryCode,
                    languageCodes: radioData.languageCodes,
                    pubkey: event.pubkey,
                    tags: event.tags,
                    streams: radioData.streams,
                    created_at: event.created_at || Math.floor(Date.now() / 1000),
                }

                // Add to stations list, avoiding duplicates
                setStations((prev) => {
                    const exists = prev.some((s) => s.id === station.id)
                    if (exists) return prev
                    return [...prev, station].sort((a, b) => b.created_at - a.created_at)
                })
            } catch (error) {
                console.error('Error processing station event:', error)
            }
        })

        return () => {
            subscription.stop()
        }
    }, [])

    const genres = useMemo(() => {
        const allTags = new Set<string>()
        stations.forEach((station) =>
            station.tags?.forEach((tag) => {
                if (tag[0] === 't') {
                    // Assuming 't' tags are genres
                    allTags.add(tag[1])
                }
            }),
        )
        return Array.from(allTags).sort()
    }, [stations])

    const filteredStations = useMemo(() => {
        if (!selectedGenre) {
            return stations
        }
        return stations.filter((station) => station.tags?.some((tag) => tag[0] === 't' && tag[1] === selectedGenre))
    }, [stations, selectedGenre])

    return (
        <div className="container py-4">
            <h1 className="text-2xl font-bold mb-4">Radio Stations</h1>

            {/* Genre filter */}
            <div className="mb-4 flex flex-wrap gap-2">
                <button
                    className={`px-3 py-1 rounded-md ${selectedGenre === null ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                    onClick={() => setSelectedGenre(null)}
                >
                    All
                </button>
                {genres.map((genre: string) => (
                    <button
                        key={genre}
                        className={`px-3 py-1 rounded-md ${selectedGenre === genre ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                        onClick={() => setSelectedGenre(genre)}
                    >
                        {genre}
                    </button>
                ))}
            </div>

            {/* Stations list */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredStations.map((station: Station) => (
                    <RadioCard key={station.id} station={station} />
                ))}

                {filteredStations.length === 0 && (
                    <div className="col-span-full text-center py-8 text-gray-500">
                        {stations.length === 0 ? 'Loading stations...' : 'No stations found for the selected genre.'}
                    </div>
                )}
            </div>
        </div>
    )
}
