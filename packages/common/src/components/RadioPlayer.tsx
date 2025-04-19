'use client'

import { Button } from '@wavefunc/ui/components/ui/button'
import { Slider } from '@wavefunc/ui/components/ui/slider'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@wavefunc/ui/components/ui/tooltip'
import {
    nextStation,
    previousStation,
    stationsStore,
    togglePlayback,
    useHasNext,
    useHasPrevious,
} from '@wavefunc/common'
import { cn } from '@wavefunc/common'
import { type StreamMetadata, setupMetadataListeners } from '@wavefunc/common'
import { useStore } from '@tanstack/react-store'
import {
    Headphones,
    Loader2,
    PauseCircle,
    PlayCircle,
    Radio,
    SkipBack,
    SkipForward,
    Volume1,
    Volume2,
    VolumeX,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
// import { MusicRecognitionButton } from './MusicRecognitionButton'
// import { StreamMetadataDisplay } from './radio/StreamMetadataDisplay'
import { StreamTechnicalInfo } from './radio/StreamTechnicalInfo'

export function RadioPlayer() {
    // Use the stationsStore directly
    const { isPlaying, currentStation } = useStore(stationsStore)
    const hasNext = useHasNext()
    const hasPrevious = useHasPrevious()

    // Local state for radio player features
    const [metadata, setMetadata] = useState<StreamMetadata | undefined>()
    const [streamUrl, setStreamUrl] = useState<string | undefined>(currentStation?.streams?.[0]?.url)
    const [isBuffering, setIsBuffering] = useState(false)
    const [error, setError] = useState<string | undefined>()
    const [showVolumeControl, setShowVolumeControl] = useState(false)
    const [showTechnicalInfo, setShowTechnicalInfo] = useState(false)
    const audioRef = useRef<HTMLAudioElement>(null)
    const [audioVolume, setAudioVolume] = useState(1)
    const stationChangeRef = useRef(false)

    // Update stream URL when current station changes
    useEffect(() => {
        if (currentStation && currentStation.streams && currentStation.streams.length > 0) {
            console.log('Station changed to:', currentStation.name)
            setStreamUrl(currentStation.streams[0].url)
            setError(undefined)
            stationChangeRef.current = true

            // Reset metadata when station changes
            setMetadata(undefined)
        }
    }, [currentStation])

    // Setup audio event listeners
    useEffect(() => {
        const audio = audioRef.current
        if (!audio) return

        const onPlay = () => {
            console.log('Audio playing')
            setIsBuffering(false)
        }

        const onPause = () => {
            console.log('Audio paused')
        }

        const onWaiting = () => {
            console.log('Audio buffering')
            setIsBuffering(true)
        }

        const onPlaying = () => {
            console.log('Audio playing after buffering')
            setIsBuffering(false)
            stationChangeRef.current = false
        }

        const onError = (e: ErrorEvent) => {
            console.error('Audio error:', e)
            setError('Failed to load stream')
            setIsBuffering(false)
        }

        // Set up metadata listeners
        let cleanupMetadata: (() => void) | undefined
        if (currentStation) {
            try {
                cleanupMetadata = setupMetadataListeners(audio, (newMetadata) => {
                    console.log('Received metadata:', newMetadata)
                    setMetadata(newMetadata)
                })
            } catch (err) {
                console.error('Error setting up metadata listeners:', err)
            }
        }

        // Add event listeners
        audio.addEventListener('play', onPlay)
        audio.addEventListener('pause', onPause)
        audio.addEventListener('waiting', onWaiting)
        audio.addEventListener('playing', onPlaying)
        audio.addEventListener('error', onError as EventListener)

        // Update volume
        audio.volume = audioVolume

        // Play or pause based on isPlaying state
        if (isPlaying) {
            // When URL changes, we need to load and play
            if (audio.paused || stationChangeRef.current) {
                console.log('Starting playback for', currentStation?.name)
                const playPromise = audio.play()
                if (playPromise !== undefined) {
                    playPromise.catch((error) => {
                        console.error('Error playing audio:', error)
                        setError('Playback error: ' + error.message)
                    })
                }
            }
        } else {
            if (!audio.paused) {
                audio.pause()
            }
        }

        // Cleanup
        return () => {
            audio.removeEventListener('play', onPlay)
            audio.removeEventListener('pause', onPause)
            audio.removeEventListener('waiting', onWaiting)
            audio.removeEventListener('playing', onPlaying)
            audio.removeEventListener('error', onError as EventListener)
            if (cleanupMetadata) cleanupMetadata()
        }
    }, [isPlaying, currentStation, audioVolume, streamUrl])

    const handleVolumeChange = (value: number[]) => {
        const newVolume = value[0]
        setAudioVolume(newVolume)
        if (audioRef.current) {
            audioRef.current.volume = newVolume
        }
    }

    // Function to determine which volume icon to show
    const getVolumeIcon = () => {
        if (audioVolume === 0) return VolumeX
        if (audioVolume < 0.5) return Volume1
        return Volume2
    }

    // Get Icon dynamically
    const VolumeIcon = getVolumeIcon()

    return (
        <div className={cn('fixed bottom-0 left-0 right-0 bg-background px-4 py-3 z-30', 'border-t-4 border-black')}>
            <div className="max-w-7xl mx-auto flex flex-wrap md:flex-nowrap items-center justify-between gap-4">
                <audio ref={audioRef} src={streamUrl} autoPlay={isPlaying} className="hidden" />

                <div className="flex items-center gap-4 w-full md:w-auto">
                    <div className="flex items-center gap-2">
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        onClick={previousStation}
                                        variant="outline"
                                        size="icon"
                                        disabled={!hasPrevious || isBuffering}
                                        className="h-8 w-8 min-w-8"
                                    >
                                        <SkipBack className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Previous Station</TooltipContent>
                            </Tooltip>
                        </TooltipProvider>

                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        onClick={() => togglePlayback()}
                                        variant="outline"
                                        size="icon"
                                        disabled={!!error}
                                        className={cn(
                                            'h-10 w-10 min-w-10 border-2 border-black',
                                            'shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]',
                                            isPlaying
                                                ? 'bg-red-500 hover:bg-red-600 text-white'
                                                : 'bg-green-500 hover:bg-green-600 text-white',
                                            'transition-transform hover:translate-y-[-2px]',
                                        )}
                                    >
                                        {isBuffering ? (
                                            <Loader2 className="h-5 w-5 animate-spin" />
                                        ) : isPlaying ? (
                                            <PauseCircle className="h-5 w-5" />
                                        ) : (
                                            <PlayCircle className="h-5 w-5" />
                                        )}
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    {isBuffering ? 'Buffering...' : isPlaying ? 'Pause' : 'Play'}
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>

                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        onClick={nextStation}
                                        variant="outline"
                                        size="icon"
                                        disabled={!hasNext || isBuffering}
                                        className="h-8 w-8 min-w-8"
                                    >
                                        <SkipForward className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Next Station</TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>

                    <div className="flex flex-col justify-center overflow-hidden">
                        <div className="flex items-center">
                            <Radio className="h-4 w-4 mr-2 text-green-500" />
                            <span className="font-bold text-sm truncate">
                                {currentStation?.name || 'Unknown Station'}
                            </span>
                            {isBuffering && (
                                <span className="ml-2 text-xs bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded animate-pulse">
                                    Buffering...
                                </span>
                            )}
                        </div>

                        <p className="text-xs text-muted-foreground truncate">
                            {metadata?.title ||
                                metadata?.songTitle ||
                                metadata?.artist ||
                                (currentStation?.description
                                    ? `${currentStation.description.slice(0, 50)}...`
                                    : 'No metadata available')}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3 ml-auto">
                    {error && (
                        <div className="bg-red-100 text-red-800 px-3 py-1 rounded-md border-2 border-red-500 text-xs font-medium">
                            Error: {error}
                        </div>
                    )}

                    {/* {audioRef.current && <MusicRecognitionButton audioElement={audioRef.current} />} */}

                    <div className="relative">
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={() => setShowVolumeControl(!showVolumeControl)}
                                    >
                                        <VolumeIcon className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Adjust Volume</TooltipContent>
                            </Tooltip>
                        </TooltipProvider>

                        {showVolumeControl && (
                            <div
                                className={cn(
                                    'absolute bottom-full right-0 mb-2 p-3 bg-background',
                                    'border-2 border-black rounded-md shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]',
                                    'animate-in fade-in-50 slide-in-from-bottom-5',
                                )}
                            >
                                <Slider
                                    defaultValue={[audioVolume]}
                                    max={1}
                                    step={0.01}
                                    value={[audioVolume]}
                                    onValueChange={handleVolumeChange}
                                    className="w-32"
                                />
                            </div>
                        )}
                    </div>

                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className={cn(
                                        'h-9 w-9 border-2 border-black',
                                        'shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]',
                                        'transition-transform hover:translate-y-[-2px]',
                                    )}
                                    onClick={() => setShowTechnicalInfo(!showTechnicalInfo)}
                                >
                                    <Headphones className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Station Technical Info</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            </div>

            {showTechnicalInfo && metadata && (
                <div className="mt-2 p-3 bg-gray-100 rounded-md border border-gray-300 text-xs animate-in slide-in-from-bottom-5">
                    <StreamTechnicalInfo metadata={metadata} resolvedUrl={streamUrl} isLoading={isBuffering} />
                </div>
            )}
        </div>
    )
}
