import type { RecognitionResult } from '@/types/recognition'
import { NDKEvent, NDKKind } from '@nostr-dev-kit/ndk'
import type { NDKFilter } from '@nostr-dev-kit/ndk'
import { ndkActions } from '../store/ndk'

/**
 * DVMCP Client Service
 *
 * Implements a client for the Data Vending Machine Context Protocol (DVMCP)
 * as specified in: https://github.com/gzuuus/dvmcp/blob/master/docs/dvmcp-spec.md
 */
class DVMCPService {
    private static instance: DVMCPService

    // Nostr event kinds defined by DVMCP spec
    private readonly ANNOUNCEMENT_KIND = 31990 as NDKKind
    private readonly REQUEST_KIND = 5910 as NDKKind
    private readonly RESPONSE_KIND = 6910 as NDKKind
    private readonly FEEDBACK_KIND = 7000 as NDKKind

    // Cache of discovered DVMs
    private dvmProviders: { pubkey: string; name: string; tools: any[] }[] = []

    private constructor() {
        // No-op constructor
    }

    public static getInstance(): DVMCPService {
        if (!DVMCPService.instance) {
            DVMCPService.instance = new DVMCPService()
        }
        return DVMCPService.instance
    }

    /**
     * Discover available DVMCP providers and their tools
     */
    public async discoverProviders(): Promise<any[]> {
        try {
            // Check cache first
            if (this.dvmProviders.length > 0) {
                return this.dvmProviders
            }

            console.log('Discovering DVMCP providers...')

            // Look for NIP-89 announcements
            const filter: NDKFilter = {
                kinds: [this.ANNOUNCEMENT_KIND],
                '#capabilities': ['mcp-1.0'],
                '#t': ['mcp'],
                limit: 10,
            }

            const ndk = ndkActions?.getNDK()

            if (!ndk) {
                throw new Error('NDK not initialized')
            }

            const events = await ndk.fetchEvents(filter)

            const providers: { pubkey: string; name: string; tools: any[] }[] = []

            for (const event of events) {
                try {
                    const content = JSON.parse(event.content)
                    providers.push({
                        pubkey: event.pubkey,
                        name: content.name || 'Unknown DVM',
                        tools: content.tools || [],
                    })
                } catch (error) {
                    console.error('Error parsing DVM announcement:', error)
                }
            }

            if (providers.length === 0) {
                console.log('No DVMCP providers found through NIP-89, trying direct list-tools request')
                await this.discoverThroughListTools()
            } else {
                this.dvmProviders = providers
                console.log(`Found ${providers.length} DVMCP providers`)
            }

            return this.dvmProviders
        } catch (error) {
            console.error('Failed to discover DVMCP providers:', error)
            throw error
        }
    }

    /**
     * Discover tools through direct list-tools request
     */
    private async discoverThroughListTools(): Promise<void> {
        const ndk = ndkActions?.getNDK()

        if (!ndk) {
            throw new Error('NDK not initialized')
        }
        // Create a request to list all available tools
        const requestEvent = new NDKEvent(ndk)
        requestEvent.kind = this.REQUEST_KIND
        requestEvent.content = ''
        requestEvent.tags = [
            ['c', 'list-tools'],
            ['output', 'application/json'],
        ]

        await requestEvent.sign()

        // Subscribe to responses
        const sub = ndk.subscribe({
            kinds: [this.RESPONSE_KIND],
            '#e': [requestEvent.id],
            limit: 10,
        })

        const providers: { pubkey: string; name: string; tools: any[] }[] = []

        // Create a promise that will resolve when we get responses
        const responsePromise = new Promise<void>((resolve) => {
            // Set a timeout to ensure we don't wait forever
            const timeout = setTimeout(() => {
                sub.stop()
                resolve()
            }, 5000)

            sub.on('event', (event: NDKEvent) => {
                try {
                    const commandTag = event.tags.find((tag) => tag[0] === 'c')
                    const command = commandTag ? commandTag[1] : null

                    if (command === 'list-tools-response') {
                        const content = JSON.parse(event.content)
                        providers.push({
                            pubkey: event.pubkey,
                            name: 'DVM Provider',
                            tools: content.tools || [],
                        })
                    }
                } catch (error) {
                    console.error('Error processing tool list response:', error)
                }
            })
        })

        // Publish the request
        await requestEvent.publish()

        // Wait for responses
        await responsePromise

        if (providers.length > 0) {
            this.dvmProviders = providers
        }
    }

    /**
     * Execute the music recognition tool through DVMCP
     */
    public async recognizeSong(audioUrl: string): Promise<RecognitionResult> {
        try {
            // Ensure we have discovered providers
            const providers = await this.discoverProviders()

            if (providers.length === 0) {
                throw new Error('No DVMCP providers available')
            }

            // Find a provider that supports music_recognition
            const provider = providers.find((p) => p.tools.some((tool: any) => tool.name === 'music_recognition'))

            if (!provider) {
                throw new Error('No DVM provider found that supports music recognition')
            }

            console.log(`Using DVMCP provider: ${provider.name}`)

            const ndk = ndkActions.getNDK()

            if (!ndk) {
                throw new Error('NDK not initialized')
            }

            // Create the tool execution request
            const requestEvent = new NDKEvent(ndk)
            requestEvent.kind = this.REQUEST_KIND
            requestEvent.content = JSON.stringify({
                name: 'music_recognition',
                parameters: {
                    audioUrl,
                    requestId: Date.now().toString(),
                },
            })

            requestEvent.tags = [
                ['c', 'execute-tool'],
                ['p', provider.pubkey],
                ['output', 'application/json'],
            ]

            await requestEvent.sign()

            // Subscribe to responses and feedback
            const sub = ndkActions.getNDK().subscribe({
                kinds: [this.RESPONSE_KIND, this.FEEDBACK_KIND],
                '#e': [requestEvent.id],
            })

            // Create a promise that will resolve with the recognition result
            const resultPromise = new Promise<RecognitionResult>((resolve, reject) => {
                // Set a timeout
                const timeout = setTimeout(() => {
                    sub.stop()
                    reject(new Error('Recognition request timed out'))
                }, 30000)

                sub.on('event', (event: NDKEvent) => {
                    try {
                        if (event.kind === this.FEEDBACK_KIND) {
                            // Handle feedback
                            const statusTag = event.tags.find((tag) => tag[0] === 'status')
                            const status = statusTag ? statusTag[1] : null

                            console.log(`DVMCP feedback: ${status}`)

                            if (status === 'error') {
                                clearTimeout(timeout)
                                sub.stop()
                                reject(new Error(event.content || 'Unknown error'))
                            }
                        } else if (event.kind === this.RESPONSE_KIND) {
                            // Handle response
                            const commandTag = event.tags.find((tag) => tag[0] === 'c')
                            const command = commandTag ? commandTag[1] : null

                            if (command === 'execute-tool-response') {
                                clearTimeout(timeout)

                                const content = JSON.parse(event.content)

                                if (content.isError) {
                                    reject(new Error(content.error || 'Unknown error'))
                                } else if (content.result) {
                                    resolve(content.result)
                                } else {
                                    reject(new Error('Invalid response format'))
                                }

                                sub.stop()
                            }
                        }
                    } catch (error) {
                        console.error('Error processing DVMCP response:', error)
                    }
                })
            })

            // Publish the request
            await requestEvent.publish()
            console.log('Published DVMCP request:', requestEvent.id)

            // Wait for the result
            return await resultPromise
        } catch (error) {
            console.error('DVMCP recognition failed:', error)
            throw error
        }
    }
}

export const mcpService = DVMCPService.getInstance()
