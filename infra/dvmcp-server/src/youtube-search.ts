#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js'
import { GetListByKeyword, GetVideoDetails } from 'youtube-search-api'

const log = (message: string) => {
    if (typeof process !== 'undefined' && process.stderr) {
        process.stderr.write(message)
    } else {
        console.log(message.replace(/\n$/, ''))
    }
}

// Create server
const server = new Server(
    {
        name: 'wavefunc-youtube-search',
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
            name: 'youtube-search',
            description: 'Search for YouTube videos, channels, and playlists',
            inputSchema: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'Search query',
                    },
                    type: {
                        type: 'string',
                        description: 'Type of content to search for',
                        enum: ['video', 'channel', 'playlist', 'all'],
                        default: 'video',
                    },
                    limit: {
                        type: 'number',
                        description: 'Maximum number of results (1-50)',
                        default: 10,
                        minimum: 1,
                        maximum: 50,
                    },
                },
                required: ['query'],
            },
        },
        {
            name: 'youtube-video-details',
            description: 'Get detailed information about a specific YouTube video',
            inputSchema: {
                type: 'object',
                properties: {
                    videoId: {
                        type: 'string',
                        description: 'YouTube video ID',
                    },
                },
                required: ['videoId'],
            },
        },
    ],
}))

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params

    try {
        switch (name) {
            case 'youtube-search':
                return await handleYouTubeSearch(args as any)
            case 'youtube-video-details':
                return await handleVideoDetails(args as any)
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

async function handleYouTubeSearch(args: {
    query: string
    type?: 'video' | 'channel' | 'playlist' | 'all'
    limit?: number
}) {
    const { query, type = 'video', limit = 10 } = args

    console.log(`[YouTube Search] Searching for: "${query}" (type: ${type}, limit: ${limit})`)

    const searchOptions = {
        type: type === 'all' ? undefined : type,
        limit: Math.min(Math.max(limit, 1), 50), // Ensure limit is between 1 and 50
    }

    const results = await GetListByKeyword(
        query,
        false,
        searchOptions.limit,
        searchOptions.type ? [{ type: searchOptions.type }] : undefined,
    )

    log(`[YouTube Search] Results: ${JSON.stringify(results.items[0])}`)

    // Process and clean up the results
    const processedResults =
        results.items?.map((item: any) => ({
            id: item.id || '',
            type: item.type || 'video',
            title: item.title || '',
            description: item.description || '',
            thumbnail: item.thumbnail?.thumbnails ? item.thumbnail : item.thumbnail?.url || '',
            duration: item.length?.simpleText || '',
            publishedTime: item.publishedTime || '',
            viewCount: item.viewCount || '',
            channelTitle: item.channelTitle || '',
            channelId: item.channelId || '',
            url: `https://www.youtube.com/watch?v=${item.id || ''}`,
            embedUrl: `https://www.youtube.com/embed/${item.id || ''}`,
        })) || []

    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify({
                    type: 'youtube-search-result',
                    query,
                    searchType: type,
                    totalResults: results.items?.length || 0,
                    results: processedResults,
                }),
            },
        ],
    }
}

async function handleVideoDetails(args: { videoId: string }) {
    const { videoId } = args

    log(`[YouTube Video Details] Getting details for video: ${videoId}`)

    const details = await GetVideoDetails(videoId)

    // Process and clean up the video details - handle the actual API response structure
    const processedDetails = {
        id: (details as any).id || videoId,
        title: (details as any).title || '',
        description: (details as any).description || '',
        thumbnail: (details as any).thumbnail?.thumbnails
            ? (details as any).thumbnail
            : (details as any).thumbnail?.url || '',
        duration: (details as any).duration || (details as any).lengthSeconds || '',
        publishDate: (details as any).publishDate || (details as any).uploadDate || '',
        viewCount: (details as any).viewCount || '',
        likeCount: (details as any).likeCount || '',
        channelTitle: (details as any).channelTitle || (details as any).author || '',
        channelId: (details as any).channelId || '',
        tags: (details as any).keywords || (details as any).tags || [],
        category: (details as any).category || '',
        url: `https://www.youtube.com/watch?v=${videoId}`,
        embedUrl: `https://www.youtube.com/embed/${videoId}`,
    }

    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify({
                    type: 'youtube-video-details-result',
                    videoId,
                    details: processedDetails,
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
    try {
        console.log('[MCP] Starting YouTube Search Server...')
        const transport = new StdioServerTransport()
        await server.connect(transport)
        console.error('[MCP] YouTube Search Server running on stdio')
    } catch (error) {
        console.error('[MCP] Failed to start server:', error)
        process.exit(1)
    }
}

main().catch((error) => {
    console.error('[MCP] Fatal error:', error)
    process.exit(1)
})
