import { useEffect, useState } from 'react'
import { Music, Radio, Info } from 'lucide-react'

interface StreamMetadata {
    title?: string
    artist?: string
    album?: string
    artwork?: string
    icyName?: string
    icyDescription?: string
    icyGenre?: string
    icyBitrate?: string
    icySamplerate?: string
    songTitle?: string
    songArtist?: string
    songAlbum?: string
    songYear?: string
    songGenre?: string
}

interface StreamMetadataDisplayProps {
    audioElement: HTMLAudioElement | null
    initialMetadata?: Partial<StreamMetadata>
    stationName?: string
    stationGenre?: string
    stationDescription?: string
}

export function StreamMetadataDisplay({
    audioElement,
    initialMetadata = {},
    stationName,
    stationGenre,
    stationDescription,
}: StreamMetadataDisplayProps) {
    const [metadata, setMetadata] = useState<Partial<StreamMetadata>>({
        ...initialMetadata,
        title: stationName,
        icyGenre: stationGenre,
        icyDescription: stationDescription,
    })

    // Setup ICY metadata extraction
    useEffect(() => {
        if (!audioElement) return

        // Event listeners for metadata updates
        const handleMetadataChange = (event: Event) => {
            const target = event.target as any
            if (target && target.mozGetMetadata) {
                try {
                    const newMetadata = target.mozGetMetadata()
                    if (newMetadata) {
                        setMetadata((prev) => ({
                            ...prev,
                            songTitle: newMetadata.title,
                            songArtist: newMetadata.artist,
                            songAlbum: newMetadata.album,
                        }))
                    }
                } catch (error) {
                    console.warn('Error extracting metadata:', error)
                }
            }
        }

        // For Icecast/SHOUTcast streams that send metadata updates
        const handleIcyMetadata = (event: any) => {
            if (event.detail) {
                const icyData = event.detail
                setMetadata((prev) => ({
                    ...prev,
                    songTitle: icyData.StreamTitle || prev.songTitle,
                    icyName: icyData.icy_name || prev.icyName,
                    icyDescription: icyData.icy_description || prev.icyDescription,
                    icyGenre: icyData.icy_genre || prev.icyGenre,
                    icyBitrate: icyData.icy_br || prev.icyBitrate,
                }))
            }
        }

        // Add event listeners
        audioElement.addEventListener('loadedmetadata', handleMetadataChange)
        audioElement.addEventListener('icy-metadata', handleIcyMetadata)

        // If browser supports media session API, use it for metadata
        if ('mediaSession' in navigator) {
            navigator.mediaSession.setActionHandler('play', () => {
                audioElement.play()
            })

            navigator.mediaSession.setActionHandler('pause', () => {
                audioElement.pause()
            })

            // Update media session metadata
            if (metadata.songTitle) {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: metadata.songTitle || stationName || '',
                    artist: metadata.songArtist || metadata.icyName || '',
                    album: metadata.songAlbum || metadata.icyDescription || '',
                    artwork: [
                        { src: metadata.artwork || '/placeholder-station.png', sizes: '512x512', type: 'image/png' },
                    ],
                })
            }
        }

        return () => {
            audioElement.removeEventListener('loadedmetadata', handleMetadataChange)
            audioElement.removeEventListener('icy-metadata', handleIcyMetadata)
        }
    }, [audioElement, stationName, metadata.songTitle])

    // Update metadata when initial values change
    useEffect(() => {
        setMetadata((prev) => ({
            ...prev,
            ...initialMetadata,
            title: stationName || prev.title,
            icyGenre: stationGenre || prev.icyGenre,
            icyDescription: stationDescription || prev.icyDescription,
        }))
    }, [initialMetadata, stationName, stationGenre, stationDescription])

    // Display the appropriate title
    const displayTitle = metadata.songTitle || metadata.title || stationName || 'Unknown'
    const displayArtist = metadata.songArtist || metadata.icyName || 'Unknown Artist'
    const displayInfo = metadata.songAlbum || metadata.icyDescription || ''

    return (
        <div className="flex flex-col overflow-hidden">
            <h3 className="text-lg font-semibold truncate text-white">{displayTitle}</h3>

            <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-300 truncate flex items-center">
                        <Radio className="w-3 h-3 mr-1 flex-shrink-0" />
                        {displayArtist}
                    </p>

                    {displayInfo && (
                        <p className="text-xs text-gray-400 truncate flex items-center">
                            <Info className="w-3 h-3 mr-1 flex-shrink-0" />
                            {displayInfo}
                        </p>
                    )}
                </div>

                <div className="flex gap-2 flex-wrap">
                    {metadata.icyGenre && (
                        <div className="text-xs bg-gray-700 px-2 py-1 rounded-full flex items-center text-gray-300">
                            <Music className="w-3 h-3 mr-1 flex-shrink-0" />
                            {metadata.icyGenre}
                        </div>
                    )}

                    {metadata.icyBitrate && (
                        <div className="text-xs bg-gray-700 px-2 py-1 rounded-full text-gray-300">
                            {metadata.icyBitrate} kbps
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
