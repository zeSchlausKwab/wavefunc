import { Button } from '@wavefunc/ui/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@wavefunc/ui/components/ui/dialog'
import { mcpService } from '@wavefunc/common'
import { ndkStore } from '@wavefunc/common'
import { stationsStore } from '@wavefunc/common'
import { cn } from '@wavefunc/common'
import type { RecognitionResult } from '@wavefunc/common'
import { NDKEvent, NDKKind, type NostrEvent } from '@nostr-dev-kit/ndk'
import { useStore } from '@tanstack/react-store'
import { ExternalLink, Music2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
const JOB_KIND = 5000 // Music recognition job request
const RESULT_KIND = 6000 // Music recognition result (1000 higher than request)
const FEEDBACK_KIND = 7000 // Job feedback
const RECORDING_DURATION = 5 // seconds

interface MusicRecognitionButtonProps {
    audioElement: HTMLAudioElement | null
}

export function MusicRecognitionButton({ audioElement }: MusicRecognitionButtonProps) {
    const currentStation = useStore(stationsStore, (state) => state.currentStation)
    const [isLoading, setIsLoading] = useState(false)
    const [result, setResult] = useState<RecognitionResult | null>(null)
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const audioContextRef = useRef<AudioContext | null>(null)
    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const audioChunksRef = useRef<Blob[]>([])
    const streamRef = useRef<MediaStream | null>(null)
    const [recognitionMethod, setRecognitionMethod] = useState<'dvmcp' | 'dvm' | null>(null)
    const { ndk } = useStore(ndkStore)

    const startRecording = async () => {
        if (!currentStation || !audioElement) {
            console.error('No station or audio element')
            return
        }

        try {
            console.log('Starting recording process...')
            setIsLoading(true)

            // Get the primary stream URL
            const primaryStream = currentStation.streams.find((s: any) => s.primary) || currentStation.streams[0]
            if (!primaryStream) {
                throw new Error('No stream available')
            }

            console.log('Stream URL:', primaryStream.url)

            // Create a new audio element for recording
            const recordingAudio = new Audio()
            recordingAudio.crossOrigin = 'anonymous' // Enable CORS
            recordingAudio.src = primaryStream.url

            // Create audio context
            audioContextRef.current = new AudioContext()

            // Create a source from the recording audio element
            const source = audioContextRef.current.createMediaElementSource(recordingAudio)

            // Create a media stream destination
            const destination = audioContextRef.current.createMediaStreamDestination()

            // Connect the source to the destination
            source.connect(destination)
            streamRef.current = destination.stream

            // Create media recorder with specific MIME type
            const mimeType = 'audio/webm'
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                throw new Error(`MIME type ${mimeType} is not supported`)
            }

            console.log('Creating MediaRecorder with MIME type:', mimeType)
            mediaRecorderRef.current = new MediaRecorder(streamRef.current, {
                mimeType,
                audioBitsPerSecond: 128000, // 128 kbps
            })
            audioChunksRef.current = []

            mediaRecorderRef.current.ondataavailable = (event) => {
                console.log('Data available:', event.data.size, 'bytes')
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data)
                }
            }

            mediaRecorderRef.current.onstop = async () => {
                console.log('Recording stopped, chunks:', audioChunksRef.current.length)
                if (audioChunksRef.current.length === 0) {
                    throw new Error('No audio data was recorded')
                }
                const audioBlob = new Blob(audioChunksRef.current, { type: mimeType })
                console.log('Created blob:', audioBlob.size, 'bytes')
                await handleRecognize(audioBlob)
            }

            mediaRecorderRef.current.onerror = (event) => {
                console.error('MediaRecorder error:', event)
                setIsLoading(false)
            }

            // Start recording and playing
            recordingAudio.play()
            mediaRecorderRef.current.start(100) // Collect data every 100ms for better quality
            console.log('MediaRecorder started')

            // Stop recording after duration
            setTimeout(() => {
                console.log('Stopping recording...')
                if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                    mediaRecorderRef.current.stop()
                    recordingAudio.pause()
                    recordingAudio.remove() // Remove the audio element entirely
                }
            }, RECORDING_DURATION * 1000)
        } catch (error) {
            console.error('Error in recording process:', error)
            setIsLoading(false)
        }
    }

    const uploadToBlossom = async (audioBlob: Blob): Promise<string> => {
        console.log('Uploading to Satellite CDN...')
        console.log('Blob type:', audioBlob.type)
        console.log('Blob size:', audioBlob.size)

        // if (!window.nostr) {
        //     throw new Error('Nostr extension not found')
        // }

        // Create auth event for file upload
        const uploadAuth: NostrEvent = {
            created_at: Math.ceil(Date.now() / 1000),
            kind: 22242,
            content: 'Authorize Upload',
            tags: [
                ['name', 'sample.mp3'],
                ['size', audioBlob.size.toString()],
                ['label', 'music_recognition'],
                ['mime', 'audio/webm'], // Keep consistent with recording format
            ],
            pubkey: ndk?.activeUser?.pubkey || '',
            id: '',
            sig: '',
        }

        if (!ndk) {
            throw new Error('NDK not initialized')
        }

        const ev = new NDKEvent(ndk, uploadAuth)
        await ev.sign()

        // Sign the event
        // const signedAuth = await nostrService.getNDK().

        // Upload to Satellite CDN
        const response = await fetch(
            `https://api.satellite.earth/v1/media/item?auth=${encodeURIComponent(JSON.stringify(ev))}`,
            {
                method: 'PUT',
                body: audioBlob,
                headers: {
                    'Content-Type': 'audio/webm', // Keep consistent with recording format
                },
            },
        )

        if (!response.ok) {
            throw new Error(`Satellite CDN upload error: ${response.statusText}`)
        }

        const result = await response.json()
        console.log('Satellite CDN upload result:', result)

        // Verify we got a valid URL
        if (!result.url) {
            throw new Error('No URL returned from Satellite CDN')
        }

        // Return the CDN URL from the response
        return result.url
    }

    const handleRecognize = async (audioBlob: Blob) => {
        try {
            // Upload to Blossom
            const blossomUrl = await uploadToBlossom(audioBlob)
            console.log('Uploaded to Blossom:', blossomUrl)

            // Try DVMCP first, fall back to DVM
            try {
                console.log('Attempting recognition via DVMCP...')
                setRecognitionMethod('dvmcp')

                toast('Processing', {
                    description: 'Recognizing the song...',
                })

                const mcpResult = await mcpService.recognizeSong(blossomUrl)
                console.log('DVMCP recognition result:', mcpResult)
                handleRecognitionResult(mcpResult)
            } catch (mcpError) {
                console.warn('DVMCP recognition failed, falling back to DVM:', mcpError)
                setRecognitionMethod('dvm')

                toast('DVMCP Failed', {
                    description: 'Falling back to Direct DVM...',
                })

                await handleDVMRecognition(blossomUrl)
            }
        } catch (error) {
            console.error('Error processing recognition:', error)
            toast('Error', {
                description: error instanceof Error ? error.message : 'Failed to process recognition',
            })
            setIsLoading(false)
            setRecognitionMethod(null)
        }
    }

    const handleDVMRecognition = async (audioUrl: string) => {
        if (!ndk) {
            throw new Error('NDK not initialized')
        }

        const requestEvent = new NDKEvent(ndk)
        requestEvent.kind = JOB_KIND
        requestEvent.content = JSON.stringify({
            type: 'music_recognition',
            audioUrl,
            requestId: Date.now().toString(),
        })

        await requestEvent.sign()

        // Subscribe to both result and feedback events
        const sub = ndk.subscribe({
            kinds: [RESULT_KIND as NDKKind, FEEDBACK_KIND as NDKKind],
            '#e': [requestEvent.id],
            limit: 1,
        })

        sub.on('event', (event: NDKEvent) => handleDVMEvent(event, sub))

        console.log('Publishing request event:', requestEvent)
        await requestEvent.publish()

        // Timeout after 10 seconds
        setTimeout(() => {
            if (isLoading) {
                toast('Timeout', {
                    description: 'Recognition request timed out',
                    style: {
                        background: 'red',
                    },
                })
                setIsLoading(false)
                sub.stop()
            }
        }, 10000)
    }

    const handleDVMEvent = (event: NDKEvent, sub: any) => {
        if (event.kind === FEEDBACK_KIND) {
            const status = event.tags.find((tag) => tag[0] === 'status')?.[1]
            if (status === 'payment-required') {
                toast('Payment Required', {
                    description: 'Please complete the payment to continue recognition.',
                    style: {
                        background: 'red',
                    },
                })
            } else if (status === 'processing') {
                toast('Processing', {
                    description: 'Recognizing the song...',
                })
            } else if (status === 'error') {
                toast('Error', {
                    description: event.content || 'Failed to recognize the song',
                    style: {
                        background: 'red',
                    },
                })
                setIsLoading(false)
                sub.stop()
            }
        } else if (event.kind === RESULT_KIND) {
            const content = JSON.parse(event.content)
            if (content.type === 'audd_response') {
                handleRecognitionResult(content.result)
                sub.stop()
            } else if (content.type === 'audd_error') {
                toast('Recognition Error', {
                    description: content.error || 'Failed to recognize the song',
                    style: {
                        background: 'red',
                    },
                })
                setIsLoading(false)
                sub.stop()
            }
        }
    }

    const handleRecognitionResult = (result: RecognitionResult) => {
        setResult(result)
        setIsDialogOpen(true)
        toast('Song Recognized!', {
            description: `${result.title} by ${result.artist}`,
        })
        setIsLoading(false)
    }

    const handleClick = () => {
        if (isLoading) return
        startRecording()
    }

    const formatDuration = (ms?: number) => {
        if (!ms) return ''
        const minutes = Math.floor(ms / 60000)
        const seconds = ((ms % 60000) / 1000).toFixed(0)
        return `${minutes}:${Number(seconds) < 10 ? '0' : ''}${seconds}`
    }

    return (
        <>
            <Button
                variant="outline"
                size="icon"
                onClick={handleClick}
                disabled={isLoading || !currentStation}
                className="relative"
                title="Recognize playing song"
            >
                <Music2 className="h-4 w-4" />
                {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        {recognitionMethod && (
                            <span className="absolute -bottom-6 text-xs text-muted-foreground">
                                {recognitionMethod === 'dvmcp' ? 'DVMCP' : 'DVM'}
                            </span>
                        )}
                    </div>
                )}
            </Button>

            <Dialog open={isDialogOpen && !!result} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Song Recognition Result</DialogTitle>
                    </DialogHeader>
                    {result && (
                        <div className="grid gap-4">
                            <div className="flex items-start gap-4">
                                {result.spotify?.album?.images?.[0]?.url || result.apple_music?.artwork?.url ? (
                                    <div className="relative h-24 w-24 overflow-hidden rounded-md">
                                        <img
                                            src={result.spotify?.album?.images?.[0]?.url || '/placeholder.png'}
                                            alt={result.spotify?.album?.name || 'Album cover'}
                                            className="w-full h-full object-cover"
                                        />
                                    </div>
                                ) : null}
                                <div className="flex flex-col">
                                    <h3 className="font-semibold">{result.title}</h3>
                                    <p className="text-sm text-muted-foreground">{result.artist}</p>
                                    {result.album && <p className="text-sm text-muted-foreground">{result.album}</p>}
                                </div>
                            </div>

                            <div className="grid gap-2 text-sm">
                                {result.release_date && (
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Release Date</span>
                                        <span>{new Date(result.release_date).toLocaleDateString()}</span>
                                    </div>
                                )}
                                {(result.spotify?.duration_ms || result.apple_music?.durationInMillis) && (
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Duration</span>
                                        <span>
                                            {formatDuration(
                                                result.spotify?.duration_ms || result.apple_music?.durationInMillis,
                                            )}
                                        </span>
                                    </div>
                                )}
                                {result.apple_music?.genreNames && result.apple_music.genreNames.length > 0 && (
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Genres</span>
                                        <span>{result.apple_music.genreNames.join(', ')}</span>
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-wrap gap-2">
                                {result.spotify?.external_urls?.spotify && (
                                    <a
                                        href={result.spotify.external_urls.spotify}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={cn(
                                            'inline-flex items-center justify-center gap-2',
                                            'rounded-md bg-[#1DB954] px-3 py-2 text-sm font-semibold text-white',
                                            'hover:bg-[#1DB954]/90',
                                        )}
                                    >
                                        Spotify <ExternalLink className="h-4 w-4" />
                                    </a>
                                )}
                                {result.apple_music?.url && (
                                    <a
                                        href={result.apple_music.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={cn(
                                            'inline-flex items-center justify-center gap-2',
                                            'rounded-md bg-[#FB233B] px-3 py-2 text-sm font-semibold text-white',
                                            'hover:bg-[#FB233B]/90',
                                        )}
                                    >
                                        Apple Music <ExternalLink className="h-4 w-4" />
                                    </a>
                                )}
                                {result.song_link && (
                                    <a
                                        href={result.song_link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={cn(
                                            'inline-flex items-center justify-center gap-2',
                                            'rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground',
                                            'hover:bg-primary/90',
                                        )}
                                    >
                                        Listen <ExternalLink className="h-4 w-4" />
                                    </a>
                                )}
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    )
}
