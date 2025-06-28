#!/usr/bin/env node

import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables from the project root
const projectRoot = path.resolve(__dirname, '../../../')
dotenv.config({ path: path.join(projectRoot, '.env') })

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js'
import { DiscogsClient, MusicBrainzClient } from '../../../packages/common/src/services/music-metadata.js'

const DISCOGS_TOKEN = process.env.DISCOGS_PA_TOKEN

if (!DISCOGS_TOKEN) {
    console.warn('DISCOGS_PA_TOKEN environment variable not set - Discogs features will be disabled')
}

// Create clients using extracted methods from commons
const discogsClient = DISCOGS_TOKEN ? new DiscogsClient(DISCOGS_TOKEN) : null
const musicbrainzClient = new MusicBrainzClient()

// Create server
const server = new Server(
    {
        name: 'wavefunc-music-metadata',
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
            name: 'discogs-search',
            description: 'Search for music releases on Discogs',
            inputSchema: {
                type: 'object',
                properties: {
                    artist: {
                        type: 'string',
                        description: 'Artist name to search for',
                    },
                    title: {
                        type: 'string',
                        description: 'Title/release name to search for',
                    },
                    type: {
                        type: 'string',
                        description: 'Type of release (release, master, artist, label)',
                        default: 'release',
                    },
                    per_page: {
                        type: 'string',
                        description: 'Number of results per page (1-100)',
                        default: '10',
                    },
                    page: {
                        type: 'string',
                        description: 'Page number',
                        default: '1',
                    },
                },
                required: ['title'],
            },
        },
        {
            name: 'discogs-release',
            description: 'Get detailed information about a specific Discogs release',
            inputSchema: {
                type: 'object',
                properties: {
                    releaseId: {
                        type: 'string',
                        description: 'Discogs release ID',
                    },
                },
                required: ['releaseId'],
            },
        },
        {
            name: 'musicbrainz-search-recording',
            description: 'Search for recordings on MusicBrainz',
            inputSchema: {
                type: 'object',
                properties: {
                    artist: {
                        type: 'string',
                        description: 'Artist name to search for',
                    },
                    title: {
                        type: 'string',
                        description: 'Recording title to search for',
                    },
                    limit: {
                        type: 'string',
                        description: 'Maximum number of results (1-100)',
                        default: '10',
                    },
                    offset: {
                        type: 'string',
                        description: 'Result offset for pagination',
                        default: '0',
                    },
                },
                required: ['artist', 'title'],
            },
        },
        {
            name: 'musicbrainz-search-release',
            description: 'Search for releases on MusicBrainz',
            inputSchema: {
                type: 'object',
                properties: {
                    artist: {
                        type: 'string',
                        description: 'Artist name to search for',
                    },
                    title: {
                        type: 'string',
                        description: 'Release title to search for',
                    },
                    limit: {
                        type: 'string',
                        description: 'Maximum number of results (1-100)',
                        default: '10',
                    },
                    offset: {
                        type: 'string',
                        description: 'Result offset for pagination',
                        default: '0',
                    },
                    type: {
                        type: 'string',
                        description: 'Release type filter',
                    },
                    status: {
                        type: 'string',
                        description: 'Release status filter',
                    },
                },
                required: ['artist', 'title'],
            },
        },
        {
            name: 'musicbrainz-get-recording',
            description: 'Get detailed information about a specific MusicBrainz recording',
            inputSchema: {
                type: 'object',
                properties: {
                    recordingId: {
                        type: 'string',
                        description: 'MusicBrainz recording ID (MBID)',
                    },
                    inc: {
                        type: 'string',
                        description: 'Additional data to include (e.g., "artists", "releases")',
                    },
                },
                required: ['recordingId'],
            },
        },
        {
            name: 'musicbrainz-get-release',
            description: 'Get detailed information about a specific MusicBrainz release',
            inputSchema: {
                type: 'object',
                properties: {
                    releaseId: {
                        type: 'string',
                        description: 'MusicBrainz release ID (MBID)',
                    },
                    inc: {
                        type: 'string',
                        description: 'Additional data to include (e.g., "artists", "recordings")',
                    },
                },
                required: ['releaseId'],
            },
        },
        {
            name: 'musicbrainz-search-artist',
            description: 'Search for artists on MusicBrainz',
            inputSchema: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: 'Artist name to search for',
                    },
                    limit: {
                        type: 'string',
                        description: 'Maximum number of results (1-100)',
                        default: '10',
                    },
                    offset: {
                        type: 'string',
                        description: 'Result offset for pagination',
                        default: '0',
                    },
                },
                required: ['name'],
            },
        },
        {
            name: 'musicbrainz-get-artist',
            description: 'Get detailed information about a specific MusicBrainz artist',
            inputSchema: {
                type: 'object',
                properties: {
                    artistId: {
                        type: 'string',
                        description: 'MusicBrainz artist ID (MBID)',
                    },
                    inc: {
                        type: 'string',
                        description: 'Additional data to include (e.g., "releases", "recordings")',
                    },
                },
                required: ['artistId'],
            },
        },
        {
            name: 'musicbrainz-search-label',
            description: 'Search for labels on MusicBrainz',
            inputSchema: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: 'Label name to search for',
                    },
                    limit: {
                        type: 'string',
                        description: 'Maximum number of results (1-100)',
                        default: '10',
                    },
                    offset: {
                        type: 'string',
                        description: 'Result offset for pagination',
                        default: '0',
                    },
                },
                required: ['name'],
            },
        },
        {
            name: 'musicbrainz-get-label',
            description: 'Get detailed information about a specific MusicBrainz label',
            inputSchema: {
                type: 'object',
                properties: {
                    labelId: {
                        type: 'string',
                        description: 'MusicBrainz label ID (MBID)',
                    },
                    inc: {
                        type: 'string',
                        description: 'Additional data to include (e.g., "releases")',
                    },
                },
                required: ['labelId'],
            },
        },
    ],
}))

// Handle tool calls using extracted methods from commons
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params

    try {
        switch (name) {
            case 'discogs-search':
                return await handleDiscogsSearch(args as any)
            case 'discogs-release':
                return await handleDiscogsRelease(args as any)
            case 'musicbrainz-search-recording':
                return await handleMusicBrainzSearchRecording(args as any)
            case 'musicbrainz-search-release':
                return await handleMusicBrainzSearchRelease(args as any)
            case 'musicbrainz-get-recording':
                return await handleMusicBrainzGetRecording(args as any)
            case 'musicbrainz-get-release':
                return await handleMusicBrainzGetRelease(args as any)
            case 'musicbrainz-search-artist':
                return await handleMusicBrainzSearchArtist(args as any)
            case 'musicbrainz-get-artist':
                return await handleMusicBrainzGetArtist(args as any)
            case 'musicbrainz-search-label':
                return await handleMusicBrainzSearchLabel(args as any)
            case 'musicbrainz-get-label':
                return await handleMusicBrainzGetLabel(args as any)
            default:
                throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`)
        }
    } catch (error) {
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        type: 'error',
                        error: error instanceof Error ? error.message : 'Unknown error occurred',
                    }),
                },
            ],
            isError: true,
        }
    }
})

// Handler functions using extracted clients from commons
async function handleDiscogsSearch(args: {
    artist?: string
    title: string
    type?: string
    per_page?: string
    page?: string
}) {
    if (!discogsClient) {
        throw new Error('Discogs API token not configured')
    }

    const options = {
        type: args.type || 'release',
        per_page: parseInt(args.per_page || '10'),
        page: parseInt(args.page || '1'),
    }

    const query = args.artist ? `${args.artist} ${args.title}` : args.title
    const data = await discogsClient.search(query, options)

    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify({
                    type: 'discogs-search-result',
                    data,
                }),
            },
        ],
    }
}

async function handleDiscogsRelease(args: { releaseId: string }) {
    if (!discogsClient) {
        throw new Error('Discogs API token not configured')
    }

    const data = await discogsClient.getRelease(args.releaseId)
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify({
                    type: 'discogs-release-result',
                    data,
                }),
            },
        ],
    }
}

async function handleMusicBrainzSearchRecording(args: {
    artist: string
    title: string
    limit?: string
    offset?: string
}) {
    const options = {
        limit: parseInt(args.limit || '10'),
        offset: parseInt(args.offset || '0'),
    }

    const data = await musicbrainzClient.searchRecordings(args.artist, args.title, options)
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify({
                    type: 'musicbrainz-recording-search-result',
                    data,
                }),
            },
        ],
    }
}

async function handleMusicBrainzSearchRelease(args: {
    artist: string
    title: string
    limit?: string
    offset?: string
    type?: string
    status?: string
}) {
    const options = {
        limit: parseInt(args.limit || '10'),
        offset: parseInt(args.offset || '0'),
        type: args.type,
        status: args.status,
    }

    const data = await musicbrainzClient.searchReleases(args.artist, args.title, options)
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify({
                    type: 'musicbrainz-release-search-result',
                    data,
                }),
            },
        ],
    }
}

async function handleMusicBrainzGetRecording(args: { recordingId: string; inc?: string }) {
    const includes = args.inc ? args.inc.split(',') : undefined
    const data = await musicbrainzClient.getRecording(args.recordingId, includes)
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify({
                    type: 'musicbrainz-recording-result',
                    data,
                }),
            },
        ],
    }
}

async function handleMusicBrainzGetRelease(args: { releaseId: string; inc?: string }) {
    const includes = args.inc ? args.inc.split(',') : undefined
    const data = await musicbrainzClient.getRelease(args.releaseId, includes)
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify({
                    type: 'musicbrainz-release-result',
                    data,
                }),
            },
        ],
    }
}

async function handleMusicBrainzSearchArtist(args: { name: string; limit?: string; offset?: string }) {
    const options = {
        limit: parseInt(args.limit || '10'),
        offset: parseInt(args.offset || '0'),
    }

    const data = await musicbrainzClient.searchArtists(args.name, options)
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify({
                    type: 'musicbrainz-artist-search-result',
                    data,
                }),
            },
        ],
    }
}

async function handleMusicBrainzGetArtist(args: { artistId: string; inc?: string }) {
    const includes = args.inc ? args.inc.split(',') : undefined
    const data = await musicbrainzClient.getArtist(args.artistId, includes)
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify({
                    type: 'musicbrainz-artist-result',
                    data,
                }),
            },
        ],
    }
}

async function handleMusicBrainzSearchLabel(args: { name: string; limit?: string; offset?: string }) {
    const options = {
        limit: parseInt(args.limit || '10'),
        offset: parseInt(args.offset || '0'),
    }

    const data = await musicbrainzClient.searchLabels(args.name, options)
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify({
                    type: 'musicbrainz-label-search-result',
                    data,
                }),
            },
        ],
    }
}

async function handleMusicBrainzGetLabel(args: { labelId: string; inc?: string }) {
    const includes = args.inc ? args.inc.split(',') : undefined
    const data = await musicbrainzClient.getLabel(args.labelId, includes)
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify({
                    type: 'musicbrainz-label-result',
                    data,
                }),
            },
        ],
    }
}

// Error handling
server.onerror = (error) => console.error('[MCP Error]', error)

process.on('SIGINT', async () => {
    await server.close()
    process.exit(0)
})

// Start server
async function main() {
    const transport = new StdioServerTransport()
    await server.connect(transport)
    console.error('[MCP] Music Metadata Server running on stdio')
}

main().catch(console.error)
