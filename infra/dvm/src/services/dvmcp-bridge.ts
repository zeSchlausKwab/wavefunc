import { auddService } from './audd'
import { NDKEvent, NDKKind } from '@nostr-dev-kit/ndk'
import type { NDKFilter } from '@nostr-dev-kit/ndk'
import { dvmService } from './ndk'

/**
 * DVMCP Bridge Service
 *
 * This service implements the Data Vending Machine Context Protocol (DVMCP)
 * to bridge MCP (Model Context Protocol) tools with Nostr's DVM ecosystem.
 *
 * It follows the spec at: https://github.com/gzuuus/dvmcp/blob/master/docs/dvmcp-spec.md
 */
export class DVMCPBridgeService {
    // Nostr event kinds defined by DVMCP spec
    private readonly ANNOUNCEMENT_KIND = 31990 as NDKKind
    private readonly REQUEST_KIND = 5910 as NDKKind
    private readonly RESPONSE_KIND = 6910 as NDKKind
    private readonly FEEDBACK_KIND = 7000 as NDKKind

    private isRunning = false
    private mcp_tools = [
        {
            name: 'music_recognition',
            description: 'Recognize music from audio URL',
            inputSchema: {
                type: 'object',
                properties: {
                    audioUrl: {
                        type: 'string',
                        description: 'URL of the audio file to analyze',
                    },
                    requestId: {
                        type: 'string',
                        description: 'Optional request identifier',
                    },
                },
                required: ['audioUrl'],
                additionalProperties: false,
            },
        },
    ]

    constructor() {
        // No-op constructor
    }

    /**
     * Publish a NIP-89 announcement event to advertise MCP capabilities
     */
    private async publishAnnouncement() {
        const announcement = new NDKEvent(dvmService.getNDK())
        announcement.kind = this.ANNOUNCEMENT_KIND

        // Create a unique, consistent identifier for this DVM
        const dvmId = `dvmcp-bridge-${dvmService.getNDK().activeUser?.pubkey.slice(0, 8)}`

        announcement.content = JSON.stringify({
            name: 'Audio Recognition DVM',
            about: "Recognize songs using AudD's music recognition service via DVMCP",
            tools: this.mcp_tools,
        })

        announcement.tags = [
            ['d', dvmId],
            ['k', this.REQUEST_KIND.toString()],
            ['capabilities', 'mcp-1.0'],
            ['t', 'mcp'],
            ['t', 'music_recognition'],
            ['t', 'audio'],
        ]

        await announcement.publish()
        console.log('Published DVMCP announcement')
    }

    /**
     * Process a list-tools request and respond with available tools
     */
    private async handleListToolsRequest(event: NDKEvent) {
        const response = new NDKEvent(dvmService.getNDK())
        response.kind = this.RESPONSE_KIND
        response.content = JSON.stringify({
            tools: this.mcp_tools,
        })

        response.tags = [
            ['c', 'list-tools-response'],
            ['e', event.id],
            ['p', event.pubkey],
        ]

        await response.publish()
        console.log('Published tool list response')
    }

    /**
     * Process a tool execution request
     */
    private async handleExecuteToolRequest(event: NDKEvent) {
        try {
            // Parse the request content
            const content = JSON.parse(event.content)
            const { name, parameters } = content

            // Validate the request
            if (!name || !parameters) {
                await this.sendErrorFeedback(event, 'Invalid request: missing name or parameters')
                return
            }

            // Route to the appropriate tool handler
            if (name === 'music_recognition') {
                await this.handleMusicRecognition(event, parameters)
            } else {
                await this.sendErrorFeedback(event, `Unknown tool: ${name}`)
            }
        } catch (error) {
            console.error('Error processing execute-tool request:', error)
            await this.sendErrorFeedback(
                event,
                `Error processing request: ${error instanceof Error ? error.message : 'Unknown error'}`,
            )
        }
    }

    /**
     * Handle music recognition tool execution
     */
    private async handleMusicRecognition(event: NDKEvent, parameters: any) {
        const { audioUrl } = parameters

        if (!audioUrl) {
            await this.sendErrorFeedback(event, 'Missing audioUrl parameter')
            return
        }

        try {
            // Send processing status
            await this.sendFeedback(event, 'processing')

            // Create a mock NDK event to pass to the auddService
            const mockEvent = new NDKEvent(dvmService.getNDK())
            mockEvent.content = JSON.stringify({
                audioUrl,
                requestId: parameters.requestId || Date.now().toString(),
            })

            // Process the request through auddService but capture the response
            let result: any = null

            // Override the NDKEvent.publish method to capture the response
            const originalPublish = NDKEvent.prototype.publish

            // @ts-ignore - This is a temporary mock for capturing the response
            NDKEvent.prototype.publish = async function () {
                const content = JSON.parse(this.content)
                if (content.type === 'audd_response') {
                    result = content.result
                }
                return this
            }

            await auddService.handleEvent(mockEvent)

            // Restore original publish method
            NDKEvent.prototype.publish = originalPublish

            if (result) {
                // Send success feedback
                await this.sendFeedback(event, 'success')

                // Send response with results
                const response = new NDKEvent(dvmService.getNDK())
                response.kind = this.RESPONSE_KIND

                // Calculate processing time safely
                const createdAt = event.created_at || Math.floor(Date.now() / 1000)
                const processingTime = Date.now() - createdAt * 1000

                response.content = JSON.stringify({
                    content: [
                        {
                            type: 'text',
                            text: `Recognized: ${result.title} by ${result.artist}`,
                        },
                    ],
                    isError: false,
                    result: result, // Include the full result for clients
                    metadata: {
                        processing_time: processingTime,
                    },
                })

                response.tags = [
                    ['c', 'execute-tool-response'],
                    ['e', event.id],
                    ['p', event.pubkey],
                    ['status', 'success'],
                ]

                await response.publish()
                console.log('Published music recognition result')
            } else {
                await this.sendErrorFeedback(event, 'Song not recognized')
            }
        } catch (error) {
            console.error('Error in music recognition:', error)
            await this.sendErrorFeedback(
                event,
                `Recognition failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            )
        }
    }

    /**
     * Send a feedback event with error status
     */
    private async sendErrorFeedback(event: NDKEvent, message: string) {
        // Send error feedback
        await this.sendFeedback(event, 'error', message)

        // Send error response
        const response = new NDKEvent(dvmService.getNDK())
        response.kind = this.RESPONSE_KIND
        response.content = JSON.stringify({
            content: [
                {
                    type: 'text',
                    text: message,
                },
            ],
            isError: true,
            error: message,
        })

        response.tags = [
            ['c', 'execute-tool-response'],
            ['e', event.id],
            ['p', event.pubkey],
            ['status', 'error'],
        ]

        await response.publish()
    }

    /**
     * Send a feedback event
     */
    private async sendFeedback(event: NDKEvent, status: string, extraInfo?: string) {
        const feedback = new NDKEvent(dvmService.getNDK())
        feedback.kind = this.FEEDBACK_KIND
        feedback.content = extraInfo || ''

        feedback.tags = [
            ['status', status, extraInfo || ''],
            ['e', event.id],
            ['p', event.pubkey],
        ]

        await feedback.publish()
    }

    /**
     * Start listening for DVMCP requests
     */
    public async start() {
        if (this.isRunning) return

        try {
            // Publish service announcement
            await this.publishAnnouncement()

            // Subscribe to tool discovery requests
            const filter: NDKFilter = {
                kinds: [this.REQUEST_KIND],
                since: Math.floor(Date.now() / 1000) - 10,
            }

            const sub = dvmService.getNDK().subscribe(filter, {
                closeOnEose: false,
                dontSaveToCache: true,
            })

            sub.on('event', async (event: NDKEvent) => {
                try {
                    // Get the command tag
                    const commandTag = event.tags.find((tag) => tag[0] === 'c')
                    const command = commandTag ? commandTag[1] : null

                    if (command === 'list-tools') {
                        await this.handleListToolsRequest(event)
                    } else if (command === 'execute-tool') {
                        await this.handleExecuteToolRequest(event)
                    }
                } catch (error) {
                    console.error('Error handling DVMCP request:', error)
                }
            })

            this.isRunning = true
            console.log('DVMCP bridge started, listening for requests...')
        } catch (error) {
            console.error('Failed to start DVMCP bridge:', error)
            throw error
        }
    }
}

export const dvmcpBridgeService = new DVMCPBridgeService()
