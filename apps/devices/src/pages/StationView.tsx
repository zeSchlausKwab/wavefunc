import { useEffect, useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { Station, ndkActions, parseRadioEvent, RADIO_EVENT_KINDS } from '@wavefunc/common'
import { decodeStationNaddr } from '@wavefunc/common/src/nostr/radio'

export default function StationView() {
    const { naddr } = useParams({ from: '/station/$naddr' })
    const [station, setStation] = useState<Station | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        async function fetchStation() {
            try {
                setLoading(true)
                const ndk = ndkActions.getNDK()
                if (!ndk) {
                    throw new Error('NDK not initialized')
                }

                // Decode naddr to get event parameters
                const decodedNaddr = decodeStationNaddr(naddr)

                // Find station event using the decoded parameters
                const event = await ndk.fetchEvent({
                    kinds: [RADIO_EVENT_KINDS.STREAM as any],
                    authors: [decodedNaddr.pubkey],
                    '#d': [decodedNaddr.identifier],
                })

                if (!event) {
                    throw new Error('Station not found')
                }

                const radioData = parseRadioEvent(event as any)

                const pubkey = event.pubkey
                // TODO: Add dTag to station
                // const dTag = event.tags.find((t) => t[0] === 'd')?.[1] || ''

                const station: Station = {
                    id: event.id,
                    naddr,
                    name: radioData.name,
                    description: radioData.description,
                    website: radioData.website,
                    genre: event.tags.find((t) => t[0] === 'genre')?.[1] || '',
                    imageUrl: event.tags.find((t) => t[0] === 'thumbnail')?.[1] || '',
                    countryCode: radioData.countryCode,
                    languageCodes: radioData.languageCodes,
                    pubkey,
                    tags: event.tags,
                    streams: radioData.streams,
                    created_at: event.created_at || Math.floor(Date.now() / 1000),
                }

                setStation(station)
            } catch (err) {
                console.error('Error fetching station:', err)
                setError(`Failed to load station details: ${err instanceof Error ? err.message : 'Unknown error'}`)
            } finally {
                setLoading(false)
            }
        }

        fetchStation()
    }, [naddr])

    if (loading) {
        return <div className="flex justify-center items-center p-12">Loading station...</div>
    }

    if (error) {
        return <div className="text-red-500 p-12">{error}</div>
    }

    if (!station) {
        return <div className="p-12">Station not found</div>
    }

    return (
        <div className="container py-8">
            <div className="bg-white rounded-lg shadow-sm p-6">
                <div className="flex items-center gap-4 mb-6">
                    {station.imageUrl && (
                        <img src={station.imageUrl} alt={station.name} className="w-20 h-20 rounded-md object-cover" />
                    )}
                    <div>
                        <h1 className="text-2xl font-bold">{station.name}</h1>
                        {station.genre && <div className="text-sm text-gray-500 mt-1">{station.genre}</div>}
                    </div>
                </div>

                {station.description && (
                    <div className="mb-6">
                        <h2 className="text-lg font-medium mb-2">About</h2>
                        <p className="text-gray-700">{station.description}</p>
                    </div>
                )}

                {station.website && (
                    <div className="mb-6">
                        <h2 className="text-lg font-medium mb-2">Website</h2>
                        <a
                            href={station.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                        >
                            {station.website}
                        </a>
                    </div>
                )}

                {station.streams && station.streams.length > 0 && (
                    <div>
                        <h2 className="text-lg font-medium mb-2">Streams</h2>
                        <div className="space-y-2">
                            {station.streams.map((stream, index) => (
                                <div key={index} className="border rounded-md p-3">
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <div className="font-medium">Stream {index + 1}</div>
                                            <div className="text-sm text-gray-500">{stream.format}</div>
                                        </div>
                                        <button
                                            className="px-3 py-1 bg-primary text-white text-sm rounded-md"
                                            onClick={() => {
                                                // Here you would normally play the stream
                                                console.log('Playing stream:', stream.url)
                                                // Implement audio playback
                                            }}
                                        >
                                            Play
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
