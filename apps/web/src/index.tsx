import { file, serve, build } from 'bun'
import { config } from 'dotenv'
import { join } from 'path'
import fs from 'fs'
import tailwind from 'bun-plugin-tailwind'

config({
    path: join(process.cwd(), '../../.env'),
    override: true,
})

const VITE_PUBLIC_APP_ENV = process.env.VITE_PUBLIC_APP_ENV
const VITE_PUBLIC_WEB_PORT = process.env.VITE_PUBLIC_WEB_PORT
const VITE_PUBLIC_HOST = process.env.VITE_PUBLIC_HOST
const APP_PUBKEY = process.env.APP_PUBKEY

// Read the index.html template
const indexHtml = fs.readFileSync(join(process.cwd(), 'src', 'index.html'), 'utf8')

/**
 * Comprehensive bot detection function
 * Detects search engine crawlers, social media preview bots, and other automated agents
 */
function isBot(req: Request): boolean {
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

    return matchesKnownBot || behavesLikeBot
}

/**
 * Generate OpenGraph meta tags based on the route
 * Returns only the meta tags to be injected into the HTML
 */
async function generateOpenGraphTags(req: Request): Promise<string> {
    const url = new URL(req.url)
    const path = url.pathname
    let title = 'Wavefunc'
    let description = 'A decentralized nostr app'
    let image = `${new URL('/images/og-image.png', req.url).href}`

    // Extract route parameters
    const stationMatch = path.match(/^\/station\/([^\/]+)/)
    const profileMatch = path.match(/^\/profile\/([^\/]+)/)

    // Handle specific routes
    if (stationMatch) {
        const stationId = stationMatch[1]
        title = `Station ${stationId} | Wavefunc`
        description = `Listen to Station ${stationId} on Wavefunc - a decentralized nostr app`
        // You might want to generate station-specific images or fetch metadata

        // For now we'll use the main OG image
        // TODO: Fetch station metadata if available
    } else if (profileMatch) {
        const profileId = profileMatch[1]
        title = `${profileId}'s Profile | Wavefunc`
        description = `Check out ${profileId}'s profile on Wavefunc - a decentralized nostr app`
        // You might want to generate profile-specific images or fetch metadata

        // For now we'll use the main OG image
        // TODO: Fetch profile metadata if available
    }

    // Generate the OpenGraph meta tags to be injected
    return `
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${req.url}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:site_name" content="Wavefunc" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${image}" />
`
}

/**
 * Inject OpenGraph meta tags into the HTML for bot requests
 */
async function injectOpenGraphMetadata(html: string, req: Request): Promise<string> {
    const openGraphTags = await generateOpenGraphTags(req)

    // Inject the OpenGraph tags right before the closing head tag
    return html.replace('</head>', `${openGraphTags}</head>`)
}

// Handle static files from the public directory
const serveStatic = async (path: string) => {
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

// Build the client-side code before starting the server
async function buildClient() {
    console.log('🔨 Building client bundle...')

    try {
        const result = await build({
            entrypoints: ['./src/client.tsx'],
            outdir: './public/dist',
            minify: process.env.NODE_ENV === 'production',
            plugins: [tailwind],
            target: 'browser',
            sourcemap: 'linked',
            define: {
                'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
            },
        })

        if (result.success) {
            console.log('✅ Client bundle built successfully')
            result.outputs.forEach((output) => {
                console.log(`  - ${output.path} (${output.kind}, ${(output.size / 1024).toFixed(2)} KB)`)
            })
        } else {
            console.error('❌ Client bundle build failed')
            result.logs.forEach((log) => console.error(log))
        }
    } catch (error) {
        console.error('❌ Client bundle build error:', error)
    }
}

// Start server after bundling
async function startServer() {
    // Build client-side code first
    await buildClient()

    // Then start the server
    const server = serve({
        fetch: async (req) => {
            const url = new URL(req.url)
            const path = url.pathname

            // Serve bundled client files
            if (path.startsWith('/dist/')) {
                return serveStatic(path.substring(1)) // Remove leading slash
            }

            // Serve images
            if (path.startsWith('/images/')) {
                const imagePath = path.replace('/images/', '')
                return serveStatic(`images/${imagePath}`)
            }

            // Serve nostr.json
            if (path === '/.well-known/nostr.json') {
                return new Response(file(join(process.cwd(), 'public', '.well-known', 'nostr.json')))
            }

            // Serve environment config
            if (path === '/envConfig') {
                return new Response(
                    JSON.stringify({ VITE_PUBLIC_APP_ENV, VITE_PUBLIC_WEB_PORT, VITE_PUBLIC_HOST, APP_PUBKEY }),
                    { headers: { 'Content-Type': 'application/javascript' } },
                )
            }

            // For all other routes, serve the HTML with or without OpenGraph metadata
            let htmlContent = indexHtml

            // Detect if request is from a bot or crawler and inject OpenGraph tags if needed
            if (isBot(req)) {
                console.log(`Bot detected for ${path} - injecting OpenGraph metadata`)
                htmlContent = await injectOpenGraphMetadata(htmlContent, req)
            }

            // Serve the HTML (with or without OpenGraph metadata)
            return new Response(htmlContent, { headers: { 'Content-Type': 'text/html' } })
        },
        development: process.env.NODE_ENV !== 'production',
        port: parseInt(process.env.PORT || VITE_PUBLIC_WEB_PORT || '8080'),
        hostname: '0.0.0.0',
    })

    console.log(`🚀 Server running at ${server.url}`)
    console.log(`Environment: ${VITE_PUBLIC_APP_ENV || 'development'}`)
    console.log(`Port: ${server.port}, Hostname: ${server.hostname}`)

    return server
}

// Start the server
let server: ReturnType<typeof serve>

// Initialize and then export
startServer().then((s) => {
    server = s
})

export { server }
