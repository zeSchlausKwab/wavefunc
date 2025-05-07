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

/**
 * Proxy requests to Icecast servers with better error handling and fallback methods
 * Many Icecast servers use self-signed certificates or have certificate issues
 */
export async function proxyIcecastRequest(url: string): Promise<Response> {
    // Try multiple methods to fetch the data
    async function tryFetch(): Promise<Response | null> {
        try {
            // 1. First try with normal fetch
            const response = await fetch(url)
            if (response.ok) {
                const data = await response.text()
                return new Response(data, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                    },
                })
            }
        } catch (error: any) {
            console.log('Standard fetch failed:', error.message)
            // Continue to fallback methods
        }

        try {
            // 2. Try with the node-fetch method (used by Bun internally) with TLS checks disabled
            // This is a workaround for Bun's fetch not having a rejectUnauthorized option
            const { execSync } = await import('child_process')

            // Use curl as a fallback method with insecure flag
            const curlResult = execSync(`curl -k -s "${url}"`, { encoding: 'utf8' })

            return new Response(curlResult, {
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
            })
        } catch (error: any) {
            console.error('Curl fallback failed:', error.message)
            return null
        }
    }

    try {
        const result = await tryFetch()
        if (result) return result

        // If all methods failed
        return new Response(
            JSON.stringify({
                error: 'Failed to fetch Icecast data. The server may be using an invalid certificate.',
            }),
            {
                status: 502,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
            },
        )
    } catch (error: any) {
        console.error('Error proxying Icecast request:', error)
        return new Response(
            JSON.stringify({
                error: 'Failed to fetch Icecast server information',
                details: error.message,
            }),
            {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
            },
        )
    }
}
