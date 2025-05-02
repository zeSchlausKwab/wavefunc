import { file } from 'bun'
import { join } from 'path'

/**
 * Comprehensive bot detection function
 * Detects search engine crawlers, social media preview bots, and other automated agents
 */
export function isBot(req: Request): boolean {
    const userAgent = req.headers.get('user-agent') || ''

    // List of known bot user agent strings
    const botPatterns = [
        // Search engines
        /googlebot/i,
        /bingbot/i,
        /yandexbot/i,
        /duckduckbot/i,
        /baiduspider/i,
        /yahoo/i,

        // Social media
        /facebookexternalhit/i,
        /twitterbot/i,
        /discordbot/i,
        /whatsapp/i,
        /telegrambot/i,
        /telegram/i,
        /tg_bot/i,
        /slackbot/i,
        /linkedinbot/i,
        /pinterest/i,

        // Preview generators
        /prerender/i,
        /embedly/i,
        /quora link preview/i,
    ]

    // Direct bot detection - only use explicit user agent patterns
    // This is more efficient and less aggressive
    const matchesKnownBot = botPatterns.some((pattern) => pattern.test(userAgent))

    // Only use behavioral analysis for ambiguous cases
    let behavesLikeBot = false

    // Only perform additional checks if we haven't already identified a bot
    if (!matchesKnownBot) {
        // Check for generic bot indicators only if not already matched
        const genericBotPatterns = [
            /bot/i,
            /spider/i,
            /crawler/i,
            /http.?client/i,
            /crawl/i,
            /pingdom/i,
            /uptimerobot/i,
            /statuspage/i,
        ]

        const mightBeGenericBot = genericBotPatterns.some((pattern) => pattern.test(userAgent))

        // Only apply behavioral analysis for potential generic bots
        if (mightBeGenericBot) {
            const acceptHeader = req.headers.get('accept') || ''
            const isXmlHttpRequest = req.headers.get('x-requested-with') === 'XMLHttpRequest'
            // Bots often accept text/html but not application/json
            const preferredFormat = acceptHeader.includes('text/html') && !acceptHeader.includes('application/json')
            behavesLikeBot = preferredFormat && !isXmlHttpRequest
        }
    }

    // Reduce logging to only capture actual bot detections
    if (matchesKnownBot || behavesLikeBot) {
        console.log(`Bot detected: ${userAgent} - Known: ${matchesKnownBot} - Behavior: ${behavesLikeBot}`)
    }

    return matchesKnownBot || behavesLikeBot
}

// Handle static files from the public directory
export const serveStatic = async (path: string) => {
    const filePath = join(process.cwd(), 'public', path)
    try {
        const f = file(filePath)
        if (!f.exists()) {
            console.error(`File not found: ${filePath}`)
            return new Response('File not found', { status: 404 })
        }
        // Determine content type based on file extension
        const contentType = path.endsWith('.svg')
            ? 'image/svg+xml'
            : path.endsWith('.png')
              ? 'image/png'
              : path.endsWith('.jpg') || path.endsWith('.jpeg')
                ? 'image/jpeg'
                : path.endsWith('.css')
                  ? 'text/css'
                  : path.endsWith('.js')
                    ? 'application/javascript'
                    : 'application/octet-stream'

        return new Response(f, {
            headers: { 'Content-Type': contentType },
        })
    } catch (error) {
        console.error(`Error serving static file ${path}:`, error)
        return new Response('Internal server error', { status: 500 })
    }
}

export async function proxyIcecastRequest(url: string): Promise<Response> {
    try {
        const response = await fetch(url, {
            headers: {
                Accept: 'application/json',
                'User-Agent': 'NostrRadio/1.0',
            },
        })

        if (!response.ok) {
            return new Response(JSON.stringify({ error: 'Failed to fetch Icecast server information' }), {
                status: response.status,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
            })
        }

        const data = await response.text()

        return new Response(data, {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        })
    } catch (error) {
        return new Response(JSON.stringify({ error: 'Failed to fetch Icecast server information' }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        })
    }
}
