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

            if (playbackStateRef.current.isPlaying && !playbackStateRef.current.attemptingToPlay) {
                togglePlayback()
            }
        }

        const handleLoadStart = () => {
            setIsLoading(true)
        }

        const handleCanPlay = () => {
            setIsLoading(false)

            if (playbackStateRef.current.isPlaying && audio.paused) {
                playAudio()
            }
        }

        audio.addEventListener('metadata', handleMetadata)
        audio.addEventListener('titleupdate', handleTitleUpdate)
        audio.addEventListener('play', handlePlay)
        audio.addEventListener('pause', handlePause)
        audio.addEventListener('error', handleError)
        audio.addEventListener('loadstart', handleLoadStart)
        audio.addEventListener('canplay', handleCanPlay)

        return () => {
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

    const loadStream = async () => {
        if (!currentStation || !audioRef.current) return

        const primaryStream = currentStation.streams.find((s: any) => s.primary) || currentStation.streams[0]
        if (!primaryStream) return

        let cleanupFn: (() => void) | undefined

        try {
            setIsLoading(true)
            setError(null)

            if (audioRef.current.src) {
                audioRef.current.pause()
                audioRef.current.src = ''

                if (cleanupFn) {
                    cleanupFn()
                    cleanupFn = undefined
                }
            }

            setMetadata({
                title: currentStation.name,
                icyGenre: currentStation.genre,
                icyDescription: currentStation.description,
            })

            const resolvedUrl = await resolveStreamUrl(primaryStream.url)
            setResolvedStreamUrl(resolvedUrl)

            const streamMetadata = await extractStreamMetadata(resolvedUrl)
            setMetadata((prev) => ({ ...prev, ...streamMetadata }))

            audioRef.current.src = resolvedUrl
            audioRef.current.volume = volume
            audioRef.current.load()

            cleanupFn = setupMetadataListeners(audioRef.current, (newMetadata) => {
                setMetadata((prev) => ({ ...prev, ...newMetadata }))
            })

            if (!isPlaying) {
                togglePlayback()
            } else {
                await playAudio()
            }

            return cleanupFn
        } catch (error) {
            console.error('Error loading stream:', error)
            setError('Failed to load stream')
            setActuallyPlaying(false)

            if (playbackStateRef.current.isPlaying && !playbackStateRef.current.attemptingToPlay) {
                togglePlayback()
            }
        } finally {
            setIsLoading(false)
        }
    }

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

    const playAudio = async () => {
        if (!audioRef.current) return

        playbackStateRef.current.attemptingToPlay = true

        try {
            audioRef.current.volume = volume

            const playPromise = audioRef.current.play()

            if (playPromise !== undefined) {
                await playPromise
            }
        } catch (error: any) {
            console.error('Error playing audio:', error)
            setActuallyPlaying(false)

            if (error.name !== 'AbortError') {
                setError('Failed to play stream. Try clicking play again.')
                if (playbackStateRef.current.isPlaying) {
                    togglePlayback()
                }
            }
        } finally {
            playbackStateRef.current.attemptingToPlay = false
        }
    }

    const IconWrapper = ({ icon: Icon }: { icon: any }) => {
        return <Icon className="h-5 w-5" />
    }

    return (
        <div
            className="border-t-3 border-gray-800 fixed bottom-0 left-0 right-0  p-4 md:p-8 flex flex-col z-50 bg-white/80 backdrop-blur-sm"
            aria-label="Radio Player"
            style={{ maxHeight: '160px' }}
        >
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
                        <p>No station selected</p>
                    )}
                </div>

                <div className="flex items-center space-x-2 justify-center md:justify-end">
                    <Button
                        variant="neobrutalism"
                        size="icon"
                        disabled={!hasPrevious}
                        onClick={() => {
                            previousStation()
                        }}
                    >
                        <IconWrapper icon={SkipBack} />
                    </Button>

                    <Button
                        variant="neobrutalism"
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

                    {/* {currentStation && <MusicRecognitionButton audioElement={audioRef.current!} />} */}
                </div>
            </div>

            {error && <div className="text-red-500 text-sm mt-1">{error}</div>}

            {currentStation && (
                <StreamTechnicalInfo metadata={metadata} resolvedUrl={resolvedStreamUrl} isLoading={isLoading} />
            )}
        </div>
    )
}
