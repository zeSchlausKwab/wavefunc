import { useRef, useState } from 'react'
import { toast } from 'sonner'

const RECORDING_DURATION = 5 // seconds

export function useAudioRecorder(onRecordingComplete: (blob: Blob) => void) {
    const [isRecording, setIsRecording] = useState(false)
    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const audioChunksRef = useRef<Blob[]>([])
    const streamRef = useRef<MediaStream | null>(null)
    const audioContextRef = useRef<AudioContext | null>(null)

    const startRecording = async (streamUrl: string) => {
        try {
            setIsRecording(true)

            const recordingAudio = new Audio()
            recordingAudio.crossOrigin = 'anonymous'
            recordingAudio.src = streamUrl
            audioContextRef.current = new AudioContext()

            const source = audioContextRef.current.createMediaElementSource(recordingAudio)
            const destination = audioContextRef.current.createMediaStreamDestination()

            source.connect(destination)
            streamRef.current = destination.stream

            const mimeType = 'audio/webm'
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                throw new Error(`MIME type ${mimeType} is not supported`)
            }

            mediaRecorderRef.current = new MediaRecorder(streamRef.current, {
                mimeType,
                audioBitsPerSecond: 128000,
            })
            audioChunksRef.current = []

            mediaRecorderRef.current.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data)
                }
            }

            mediaRecorderRef.current.onstop = () => {
                setIsRecording(false)
                if (audioChunksRef.current.length === 0) {
                    toast.error('No audio data was recorded')
                    return
                }
                const audioBlob = new Blob(audioChunksRef.current, { type: mimeType })
                onRecordingComplete(audioBlob)
            }

            mediaRecorderRef.current.onerror = (event) => {
                console.error('MediaRecorder error:', event)
                setIsRecording(false)
                toast.error('Recording failed', {
                    description: 'Failed to capture audio from the stream',
                })
            }

            await recordingAudio.play()
            mediaRecorderRef.current.start()

            setTimeout(() => {
                if (mediaRecorderRef.current?.state === 'recording') {
                    mediaRecorderRef.current.stop()
                    recordingAudio.pause()
                    recordingAudio.remove()
                }
            }, RECORDING_DURATION * 1000)
        } catch (error) {
            console.error('Error in recording process:', error)
            setIsRecording(false)
            toast.error('Recording failed', {
                description: error instanceof Error ? error.message : 'Failed to record audio',
            })
        }
    }

    return { isRecording, startRecording }
}
