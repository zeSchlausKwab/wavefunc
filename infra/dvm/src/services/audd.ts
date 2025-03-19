import { NDKEvent } from '@nostr-dev-kit/ndk'
import { dvmService } from './ndk'

interface AudDResponse {
    status: 'success' | 'error'
    result: {
        title: string
        artist: string
        album: string
        release_date: string
        song_link: string
        apple_music: {
            preview: string
            url: string
        }
        spotify: {
            preview: string
            url: string
        }
    } | null
}

export class AudDService {
    private static instance: AudDService
    private readonly apiToken: string
    private readonly apiUrl = 'https://api.audd.io/'

    private constructor() {
        const token = process.env.AUDD_API_TOKEN

        if (!token) {
            throw new Error('AUDD_API_TOKEN environment variable is required')
        }

        this.apiToken = token
    }

    public static getInstance(): AudDService {
        if (!AudDService.instance) {
            AudDService.instance = new AudDService()
        }
        return AudDService.instance
    }

    public async recognizeSong(audioUrl: string): Promise<AudDResponse> {
        try {
            // Send the audio URL to AudD
            const params = new URLSearchParams({
                api_token: this.apiToken,
                url: audioUrl,
                return: 'apple_music,spotify',
                method: 'recognize',
                data_type: 'json',
            })

            const response = await fetch(`${this.apiUrl}?${params.toString()}`)
            if (!response.ok) {
                throw new Error(`AudD API error: ${response.statusText}`)
            }

            return response.json()
        } catch (error) {
            console.error('Error recognizing song:', error)
            throw error
        }
    }

    public async handleEvent(event: NDKEvent): Promise<void> {
        let content: { audioUrl?: string; requestId?: string } = {}

        try {
            content = JSON.parse(event.content)
            console.log('Received request:', content)

            if (!content.audioUrl) {
                throw new Error('No audioUrl provided in the event content')
            }

            // Send processing feedback
            const processingEvent = new NDKEvent(dvmService.getNDK())
            processingEvent.kind = 7000 // Feedback kind
            processingEvent.content = 'Processing audio sample'
            processingEvent.tags = [
                ['e', event.id],
                ['status', 'processing'],
            ]
            await processingEvent.publish()

            const result = await this.recognizeSong(content.audioUrl)
            console.log('AudD API response:', result)

            // Create response event
            const responseEvent = new NDKEvent(dvmService.getNDK())
            responseEvent.kind = 6000 // Result kind (1000 higher than request)
            responseEvent.content = JSON.stringify({
                type: 'audd_response',
                requestId: content.requestId,
                result: result.result,
            })

            // Tag the original event
            responseEvent.tags = [['e', event.id]]

            await responseEvent.publish()
        } catch (error) {
            console.error('Error processing AudD request:', error)

            // Create error response event
            const errorEvent = new NDKEvent(dvmService.getNDK())
            errorEvent.kind = 6000 // Result kind (1000 higher than request)
            errorEvent.content = JSON.stringify({
                type: 'audd_error',
                requestId: content?.requestId,
                error: error instanceof Error ? error.message : 'Unknown error',
            })

            errorEvent.tags = [['e', event.id]]

            await errorEvent.publish()
        }
    }
}

export const auddService = AudDService.getInstance()
