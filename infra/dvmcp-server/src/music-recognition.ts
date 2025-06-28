#!/usr/bin/env node

// Load .env file for local development, otherwise use variables from DVMCP bridge
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../../../')
const envPath = path.join(projectRoot, '.env')

if (fs.existsSync(envPath)) {
    console.log('Loading .env file for local development')
    const { default: dotenv } = await import('dotenv')
    dotenv.config({ path: envPath })
} else {
    console.log('Using environment variables from DVMCP bridge')
}

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js'
import { MusicMetadataService } from '../../../packages/common/src/services/music-metadata.js'

const AUDD_API_TOKEN = process.env.AUDD_API_TOKEN
const DISCOGS_TOKEN = process.env.DISCOGS_PA_TOKEN

console.log('Environment check:')
console.log(`- AUDD_API_TOKEN: ${AUDD_API_TOKEN ? '✓ Set' : '✗ Missing'}`)
console.log(`- DISCOGS_PA_TOKEN: ${DISCOGS_TOKEN ? '✓ Set' : '✗ Missing'}`)
console.log('Raw environment variable values:')
console.log(`- process.env.AUDD_API_TOKEN = "${process.env.AUDD_API_TOKEN}"`)
console.log(`- process.env.DISCOGS_PA_TOKEN = "${process.env.DISCOGS_PA_TOKEN}"`)

if (!AUDD_API_TOKEN) {
    console.error('ERROR: AUDD_API_TOKEN environment variable is required')
    console.error('Please set AUDD_API_TOKEN in your environment variables')
    process.exit(1)
}

if (!DISCOGS_TOKEN) {
    console.warn('WARNING: DISCOGS_PA_TOKEN environment variable not set - Discogs enrichment will be disabled')
}

// Create the music metadata service with enrichment capabilities
const musicService = new MusicMetadataService({
    auddToken: AUDD_API_TOKEN,
    discogsToken: DISCOGS_TOKEN,
})

// Create server
const server = new Server(
    {
        name: 'wavefunc-music-recognition',
        version: '1.0.0',
    },
    {
        capabilities: {
            tools: {},
        },
    },
)

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: 'music-recognition',
            description: 'Recognize music from an audio URL and return enriched metadata from multiple sources',
            inputSchema: {
                type: 'object',
                properties: {
                    audioUrl: {
                        type: 'string',
                        description: 'URL of the audio file to recognize (5 seconds max)',
                    },
                    enriched: {
                        type: 'boolean',
                        description: 'Whether to include enriched metadata from Discogs and MusicBrainz',
                        default: true,
                    },
                },
                required: ['audioUrl'],
            },
        },
    ],
}))

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params

    if (name !== 'music-recognition') {
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`)
    }

    const { audioUrl, enriched = true } = args as { audioUrl: string; enriched?: boolean }

    if (!audioUrl) {
        throw new McpError(ErrorCode.InvalidParams, 'audioUrl is required')
    }

    try {
        console.log(`[Music Recognition] Processing: ${audioUrl} (enriched: ${enriched})`)

        let result
        if (enriched) {
            // Use the enriched recognition that includes Discogs and MusicBrainz data
            result = await musicService.recognizeAndEnrich(audioUrl)
        } else {
            // Just basic recognition
            const recognition = await musicService.recognizeMusic(audioUrl)
            result = { recognition }
        }

        if (result.recognition) {
            console.log(`[Music Recognition] Success: ${result.recognition.artist} - ${result.recognition.title}`)
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            type: 'music_recognition_result',
                            result,
                        }),
                    },
                ],
            }
        } else {
            console.log('[Music Recognition] No music recognized')
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            type: 'music_recognition_error',
                            error: 'No music recognized',
                        }),
                    },
                ],
                isError: true,
            }
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
        console.error('[Music Recognition] Error:', errorMessage)
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        type: 'music_recognition_error',
                        error: errorMessage,
                    }),
                },
            ],
            isError: true,
        }
    }
})

// Error handling
server.onerror = (error) => console.error('[MCP Error]', error)

process.on('SIGINT', async () => {
    await server.close()
    process.exit(0)
})

// Start server
async function main() {
    try {
        console.log('[MCP] Starting Music Recognition Server...')
        const transport = new StdioServerTransport()
        await server.connect(transport)
        console.error('[MCP] Music Recognition Server running on stdio')
    } catch (error) {
        console.error('[MCP] Failed to start server:', error)
        process.exit(1)
    }
}

main().catch((error) => {
    console.error('[MCP] Fatal error:', error)
    process.exit(1)
})
