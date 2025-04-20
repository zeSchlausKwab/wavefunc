import { useEffect, useState } from 'react'
import { Station, ndkActions, subscribeToRadioStations, parseRadioEvent, RADIO_EVENT_KINDS } from '@wavefunc/common'
// import { useMedia } from 'react-use'
import RadioCard from '@wavefunc/common/src/components/radio/RadioCard'

export default function Index() {
    const [stations, setStations] = useState<Station[]>([])
    const [selectedGenre, setSelectedGenre] = useState<string | null>(null)
    // const isMobile = useMedia('(max-width: 640px)')

    useEffect(() => {
        // Get NDK instance
        const ndk = ndkActions.getNDK()
        if (!ndk) return

        // Subscribe to radio station events using helper
        const subscription = subscribeToRadioStations(ndk, (event) => {
            console.log('event', event)
            try {
                const radioData = parseRadioEvent(event)

                const dTag = event.tags.find((t) => t[0] === 'd')?.[1] || ''

                const station: Station = {
                    id: event.id,
                    naddr: `${RADIO_EVENT_KINDS.STREAM}:${event.pubkey}:${dTag}`,
                    name: radioData.name,
                    description: radioData.description,
                    website: radioData.website,
                    genre: event.tags.find((t) => t[0] === 'genre')?.[1] || '',
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

    // Extract unique genres from stations
    const genres = Array.from(
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

    // Filter stations by selected genre
    const filteredStations = selectedGenre
        ? stations.filter((station) => {
              if (!station.genre) return false
              const stationGenres = station.genre.split(',').map((g) => g.trim())
              return stationGenres.includes(selectedGenre)
          })
        : stations

    return (
        <div className="container py-4">
            <h1 className="text-2xl font-bold mb-4">Radio Stations</h1>

            {/* Genre filter */}
            <div className="mb-4 flex flex-wrap gap-2">
                <button
                    className={`px-3 py-1 rounded-md ${selectedGenre === null ? 'bg-primary text-white' : 'bg-gray-200'}`}
                    onClick={() => setSelectedGenre(null)}
                >
                    All
                </button>
                {genres.map((genre) => (
                    <button
                        key={genre}
                        className={`px-3 py-1 rounded-md ${selectedGenre === genre ? 'bg-primary text-white' : 'bg-gray-200'}`}
                        onClick={() => setSelectedGenre(genre)}
                    >
                        {genre}
                    </button>
                ))}
            </div>

            {/* Stations list */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredStations.map((station) => (
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
