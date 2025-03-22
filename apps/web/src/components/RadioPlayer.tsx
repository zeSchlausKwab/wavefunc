'use client'

import { Button } from '@/components/ui/button'
import { nextStation, previousStation, stationsStore, togglePlayback } from '@/lib/store/stations'
import { Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { MusicRecognitionButton } from './MusicRecognitionButton'
import { useStore } from '@tanstack/react-store'
import { StreamMetadataDisplay } from './radio/StreamMetadataDisplay'
import { StreamTechnicalInfo } from './radio/StreamTechnicalInfo'
import { type StreamMetadata, extractStreamMetadata, setupMetadataListeners } from '@/lib/utils/streamUtils'

// ID3v2 frame types
const ID3_FRAMES = {
    TIT2: 'title',
    TPE1: 'artist',
    TALB: 'album',
    TYER: 'year',
    TCON: 'genre',
    APIC: 'picture',
}

function parseID3v2(buffer: ArrayBuffer): Partial<StreamMetadata> {
    const view = new DataView(buffer)
    const metadata: Partial<StreamMetadata> = {}

    // Check for ID3v2 header
    if (view.getUint32(0) === 0x494433) {
        const version = view.getUint8(3)
        const size = view.getUint32(4) & 0x7fffffff
        let offset = 10

        while (offset < size) {
            const frameId = String.fromCharCode(
                view.getUint8(offset),
                view.getUint8(offset + 1),
                view.getUint8(offset + 2),
                view.getUint8(offset + 3),
            )

            const frameSize = view.getUint32(offset + 4)
            const frameFlags = view.getUint16(offset + 8)
            offset += 10

            if (frameId in ID3_FRAMES) {
                const frameData = buffer.slice(offset, offset + frameSize)
                const textDecoder = new TextDecoder('utf-8')

                switch (frameId) {
                    case 'TIT2':
                        metadata.songTitle = textDecoder.decode(frameData)
                        break
                    case 'TPE1':
                        metadata.songArtist = textDecoder.decode(frameData)
                        break
                    case 'TALB':
                        metadata.songAlbum = textDecoder.decode(frameData)
                        break
                    case 'TYER':
                        metadata.songYear = textDecoder.decode(frameData)
                        break
                    case 'TCON':
                        metadata.songGenre = textDecoder.decode(frameData)
                        break
                    case 'APIC':
                        // Handle APIC frame (picture)
                        const frameArray = new Uint8Array(frameData)
                        const nullIndex = frameArray.indexOf(0)
                        if (nullIndex !== -1) {
                            const mimeType = textDecoder.decode(frameArray.slice(0, nullIndex))
                            const imageData = frameArray.slice(nullIndex + 1)
                            metadata.artwork = URL.createObjectURL(new Blob([imageData], { type: mimeType }))
                        }
                        break
                }
            }

            offset += frameSize
        }
    }

    return metadata
}

function parseADTS(buffer: ArrayBuffer): Partial<StreamMetadata> {
    const view = new DataView(buffer)
    const metadata: Partial<StreamMetadata> = {}

    // Check for ADTS header
    if ((view.getUint16(0) & 0xfff6) === 0xfff0) {
        const sampleRate = view.getUint16(2) & 0x3c0
        const bitrate = view.getUint32(2) & 0x1ffc00

        metadata.icySamplerate = sampleRate.toString()
        metadata.icyBitrate = bitrate.toString()
    }

    return metadata
}

export function RadioPlayer() {
    const currentStation = useStore(stationsStore, (state) => state.currentStation)
    const isPlaying = useStore(stationsStore, (state) => state.isPlaying)
    const currentIndex = useStore(stationsStore, (state) => state.currentIndex)
    const stations = useStore(stationsStore, (state) => state.stations)

    const hasNext = currentIndex < stations.length - 1
    const hasPrevious = currentIndex > 0

    const [volume, setVolume] = useState(1)
    const audioRef = useRef<HTMLAudioElement | null>(null)
    const [isMuted, setIsMuted] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [resolvedStreamUrl, setResolvedStreamUrl] = useState<string | null>(null)
    const [metadata, setMetadata] = useState<StreamMetadata>({})
    const [actuallyPlaying, setActuallyPlaying] = useState(false)
    const playbackStateRef = useRef({ isPlaying, attemptingToPlay: false })

    // Update ref whenever the store changes
    useEffect(() => {
        playbackStateRef.current.isPlaying = isPlaying
    }, [isPlaying])

    useEffect(() => {
        const audio = new Audio()
        audio.preload = 'auto'
        audioRef.current = audio

        const handleMetadata = (e: any) => {
            if (e.data) {
                setMetadata((prev: StreamMetadata) => ({
                    ...prev,
                    icyName: e.data.icymetadata?.name,
                    icyDescription: e.data.icymetadata?.description,
                    icyGenre: e.data.icymetadata?.genre,
                    icyBitrate: e.data.icymetadata?.bitrate,
                    icySamplerate: e.data.icymetadata?.samplerate,
                }))
            }
        }

        const handleTitleUpdate = (e: any) => {
            if (e.data) {
                setMetadata((prev: StreamMetadata) => ({
                    ...prev,
                    title: e.data.title,
                }))
            }
        }

        const handlePlay = () => {
            playbackStateRef.current.attemptingToPlay = false
            setActuallyPlaying(true)
        }

        const handlePause = () => {
            playbackStateRef.current.attemptingToPlay = false
            setActuallyPlaying(false)
        }

        const handleError = (e: any) => {
            console.error('Audio error:', e)
            setError('Failed to load audio stream')
            setIsLoading(false)
            setActuallyPlaying(false)

            // Only toggle if we were attempting to play and not just in a transition state
            if (playbackStateRef.current.isPlaying && !playbackStateRef.current.attemptingToPlay) {
                togglePlayback()
            }
        }

        const handleLoadStart = () => {
            setIsLoading(true)
        }

        const handleCanPlay = () => {
            setIsLoading(false)

            // If we should be playing but aren't, try to play now
            if (playbackStateRef.current.isPlaying && audio.paused) {
                playAudio()
            }
        }

        // Add event listeners
        audio.addEventListener('metadata', handleMetadata)
        audio.addEventListener('titleupdate', handleTitleUpdate)
        audio.addEventListener('play', handlePlay)
        audio.addEventListener('pause', handlePause)
        audio.addEventListener('error', handleError)
        audio.addEventListener('loadstart', handleLoadStart)
        audio.addEventListener('canplay', handleCanPlay)

        return () => {
            // Clean up event listeners
            audio.removeEventListener('metadata', handleMetadata)
            audio.removeEventListener('titleupdate', handleTitleUpdate)
            audio.removeEventListener('play', handlePlay)
            audio.removeEventListener('pause', handlePause)
            audio.removeEventListener('error', handleError)
            audio.removeEventListener('loadstart', handleLoadStart)
            audio.removeEventListener('canplay', handleCanPlay)
            audio.pause()
            audio.src = ''
            audioRef.current = null
        }
    }, [])

    // Update the loadStream function to properly clean up before loading a new stream
    const loadStream = async () => {
        if (!currentStation || !audioRef.current) return

        const primaryStream = currentStation.streams.find((s: any) => s.primary) || currentStation.streams[0]
        if (!primaryStream) return

        let cleanupFn: (() => void) | undefined

        try {
            setIsLoading(true)
            setError(null)

            // Reset current audio if it's playing something else
            if (audioRef.current.src) {
                audioRef.current.pause()
                audioRef.current.src = ''

                // Clean up any existing metadata listeners
                if (cleanupFn) {
                    cleanupFn()
                    cleanupFn = undefined
                }
            }

            // Reset metadata
            setMetadata({
                title: currentStation.name,
                icyGenre: currentStation.genre,
                icyDescription: currentStation.description,
            })

            // Resolve the stream URL
            const resolvedUrl = await resolveStreamUrl(primaryStream.url)
            setResolvedStreamUrl(resolvedUrl)

            // Extract metadata from the stream
            const streamMetadata = await extractStreamMetadata(resolvedUrl)
            setMetadata((prev) => ({ ...prev, ...streamMetadata }))

            // Set audio source
            audioRef.current.src = resolvedUrl
            audioRef.current.volume = volume
            audioRef.current.load() // Explicitly load the new source

            // Setup metadata listener for real-time updates
            cleanupFn = setupMetadataListeners(audioRef.current, (newMetadata) => {
                setMetadata((prev) => ({ ...prev, ...newMetadata }))
            })

            // Always attempt to play the new station
            // This ensures autoplay when a new station is selected
            if (!isPlaying) {
                togglePlayback() // Set isPlaying to true in the store
            } else {
                await playAudio() // Start playing immediately
            }

            return cleanupFn
        } catch (error) {
            console.error('Error loading stream:', error)
            setError('Failed to load stream')
            setActuallyPlaying(false)

            // Only update state if we're not in a transitional state
            if (playbackStateRef.current.isPlaying && !playbackStateRef.current.attemptingToPlay) {
                togglePlayback()
            }
        } finally {
            setIsLoading(false)
        }
    }

    // Load the stream when current station changes
    useEffect(() => {
        if (!currentStation) return

        let cleanup: (() => void) | undefined

        const loadAndCleanup = async () => {
            cleanup = await loadStream()
        }

        loadAndCleanup()

        return () => {
            if (cleanup) cleanup()
        }
    }, [currentStation])

    // Handle playback state changes
    useEffect(() => {
        if (!audioRef.current) return

        if (isPlaying && audioRef.current.paused) {
            playAudio()
        } else if (!isPlaying && !audioRef.current.paused) {
            audioRef.current.pause()
        }
    }, [isPlaying])

    const resolveStreamUrl = async (url: string): Promise<string> => {
        const isPlaylist = /\.(pls|m3u|m3u8|asx)$/i.test(url)

        if (!isPlaylist) {
            return url
        }

        try {
            const response = await fetch(url)
            const content = await response.text()

            if (url.toLowerCase().endsWith('.pls')) {
                const match = content.match(/File1=(.*)/i)
                if (match && match[1]) {
                    return match[1].trim()
                }
            } else if (url.toLowerCase().endsWith('.m3u') || url.toLowerCase().endsWith('.m3u8')) {
                const lines = content.split('\n')
                for (const line of lines) {
                    const trimmedLine = line.trim()
                    if (trimmedLine && !trimmedLine.startsWith('#')) {
                        return trimmedLine
                    }
                }
            }

            console.warn('Could not extract stream URL from playlist:', url)
            return url
        } catch (error) {
            console.error('Error resolving playlist URL:', error)
            return url
        }
    }

    const handleMute = () => {
        if (audioRef.current) {
            audioRef.current.muted = !isMuted
            setIsMuted(!isMuted)
        }
    }

    const handleVolumeChange = (value: number) => {
        if (audioRef.current) {
            audioRef.current.volume = value / 100
            setVolume(value / 100)
        }
    }

    const playAudio = async () => {
        if (!audioRef.current) return

        // Set the flag to show we're attempting to play
        playbackStateRef.current.attemptingToPlay = true

        try {
            // Prepare audio for playback
            audioRef.current.volume = volume

            // Use a promise to catch play errors
            const playPromise = audioRef.current.play()

            if (playPromise !== undefined) {
                await playPromise
            }
        } catch (error: any) {
            console.error('Error playing audio:', error)
            setActuallyPlaying(false)

            // Only treat non-abort errors as fatal
            if (error.name !== 'AbortError') {
                setError('Failed to play stream. Try clicking play again.')
                // Only toggle playback state for errors that aren't just interruptions
                if (playbackStateRef.current.isPlaying) {
                    togglePlayback()
                }
            }
        } finally {
            playbackStateRef.current.attemptingToPlay = false
        }
    }

    // Type assertion component to help TypeScript understand the icons
    const IconWrapper = ({ icon: Icon }: { icon: any }) => {
        return <Icon className="h-5 w-5" />
    }

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-gray-900 text-white p-4 md:p-8 flex flex-col z-50">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-2">
                <div className="flex-1 overflow-hidden mb-2 md:mb-0">
                    {currentStation ? (
                        <StreamMetadataDisplay
                            audioElement={audioRef.current}
                            initialMetadata={metadata}
                            stationName={currentStation.name}
                            stationGenre={currentStation.genre}
                            stationDescription={currentStation.description}
                        />
                    ) : (
                        <p className="text-gray-400">No station selected</p>
                    )}
                </div>

                <div className="flex items-center space-x-2 justify-center md:justify-end">
                    <Button
                        variant="ghost"
                        size="icon"
                        disabled={!hasPrevious}
                        onClick={() => {
                            previousStation()
                        }}
                    >
                        <IconWrapper icon={SkipBack} />
                    </Button>

                    <Button
                        variant="ghost"
                        size="icon"
                        disabled={!currentStation}
                        onClick={() => togglePlayback()}
                        className={isLoading ? 'animate-pulse' : ''}
                    >
                        {actuallyPlaying ? <IconWrapper icon={Pause} /> : <IconWrapper icon={Play} />}
                    </Button>

                    <Button
                        variant="ghost"
                        size="icon"
                        disabled={!hasNext}
                        onClick={() => {
                            nextStation()
                        }}
                    >
                        <IconWrapper icon={SkipForward} />
                    </Button>

                    <Button variant="ghost" size="icon" onClick={handleMute}>
                        {isMuted ? <IconWrapper icon={VolumeX} /> : <IconWrapper icon={Volume2} />}
                    </Button>

                    {currentStation && <MusicRecognitionButton audioElement={audioRef.current!} />}
                </div>
            </div>

            {error && <div className="text-red-500 text-sm mt-1">{error}</div>}

            {/* Stream technical info */}
            {currentStation && (
                <StreamTechnicalInfo metadata={metadata} resolvedUrl={resolvedStreamUrl} isLoading={isLoading} />
            )}
        </div>
    )
}
