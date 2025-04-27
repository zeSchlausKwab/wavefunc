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
        /slackbot/i,
        /linkedinbot/i,
        /pinterest/i,

        // Preview generators
        /prerender/i,
        /embedly/i,
        /quora link preview/i,

        // Generic crawlers
        /bot/i,
        /spider/i,
        /crawler/i,
        /http.?client/i,
        /crawl/i,

        // Monitoring services
        /pingdom/i,
        /uptimerobot/i,
        /statuspage/i,
    ]

    // Additional signals for bot detection
    const acceptHeader = req.headers.get('accept') || ''
    const isXmlHttpRequest = req.headers.get('x-requested-with') === 'XMLHttpRequest'

    // Bots often accept text/html but not application/json
    const preferredFormat = acceptHeader.includes('text/html') && !acceptHeader.includes('application/json')

    // Check user agent against known bot patterns
    const matchesKnownBot = botPatterns.some((pattern) => pattern.test(userAgent))

    // Bots typically don't make XHR requests
    const behavesLikeBot = preferredFormat && !isXmlHttpRequest

    console.log(`Bot detection: ${userAgent} - ${matchesKnownBot} - ${behavesLikeBot}`)

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
