import { file, serve } from 'bun'
import { config } from 'dotenv'
import fs from 'fs'
import { join } from 'path'
import { buildClient } from './server/build-client'
import { isBot, serveStatic, proxyIcecastRequest } from './server/utils'
import { injectOpenGraphMetadata } from './server/og'

config({
    path: join(process.cwd(), '../../.env'),
    override: true,
})

const VITE_PUBLIC_APP_ENV = process.env.VITE_PUBLIC_APP_ENV
const VITE_PUBLIC_WEB_PORT = process.env.VITE_PUBLIC_WEB_PORT
const VITE_PUBLIC_HOST = process.env.VITE_PUBLIC_HOST
const APP_PUBKEY = process.env.APP_PUBKEY

const indexHtml = fs.readFileSync(join(process.cwd(), 'src', 'index.html'), 'utf8')
const isDev = process.env.NODE_ENV !== 'production'

// Track if we're watching file changes
let isWatching = false

// Function to watch for file changes and rebuild client in dev mode
async function setupFileWatcher() {
    if (isDev && !isWatching) {
        console.log('📺 Setting up file watcher for client rebuilds')
        isWatching = true

        const watcher = fs.watch(join(process.cwd(), 'src'), { recursive: true }, async (event, filename) => {
            // Skip server files and unnecessary rebuilds
            if (filename && !filename.includes('server/') && !filename.endsWith('index.tsx')) {
                console.log(`🔄 Detected change in ${filename}, rebuilding client...`)
                await buildClient()
            }
        })

        // Also watch common package files
        const commonWatcher = fs.watch(
            join(process.cwd(), '../../packages/common/src'),
            { recursive: true },
            async () => {
                console.log('🔄 Detected change in common package, rebuilding client...')
                await buildClient()
            },
        )

        process.on('SIGINT', () => {
            watcher.close()
            commonWatcher.close()
            process.exit(0)
        })
    }
}

async function startServer() {
    await buildClient()

    if (isDev) {
        await setupFileWatcher()
    }

    const server = serve({
        fetch: async (req) => {
            const url = new URL(req.url)
            const path = url.pathname

            if (path.startsWith('/dist/')) {
                return serveStatic(path.substring(1))
            }

            if (path.startsWith('/images/')) {
                const imagePath = path.replace('/images/', '')
                return serveStatic(`images/${imagePath}`)
            }

            if (path === '/.well-known/nostr.json') {
                return new Response(file(join(process.cwd(), 'public', '.well-known', 'nostr.json')))
            }

            if (path === '/envConfig') {
                return new Response(
                    JSON.stringify({ VITE_PUBLIC_APP_ENV, VITE_PUBLIC_WEB_PORT, VITE_PUBLIC_HOST, APP_PUBKEY }),
                    { headers: { 'Content-Type': 'application/javascript' } },
                )
            }

            // Handle Icecast proxy API endpoint
            if (path.startsWith('/api/proxy/icecast')) {
                if (req.method !== 'GET') {
                    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
                        status: 405,
                        headers: { 'Content-Type': 'application/json' },
                    })
                }

                const targetUrl = url.searchParams.get('url')
                if (!targetUrl) {
                    return new Response(JSON.stringify({ error: 'Missing URL parameter' }), {
                        status: 400,
                        headers: { 'Content-Type': 'application/json' },
                    })
                }

                try {
                    const parsedUrl = new URL(targetUrl)
                    if (!parsedUrl.pathname.endsWith('/status-json.xsl')) {
                        return new Response(JSON.stringify({ error: 'Invalid Icecast URL' }), {
                            status: 400,
                            headers: { 'Content-Type': 'application/json' },
                        })
                    }

                    return await proxyIcecastRequest(targetUrl)
                } catch (error) {
                    return new Response(JSON.stringify({ error: 'Invalid URL' }), {
                        status: 400,
                        headers: { 'Content-Type': 'application/json' },
                    })
                }
            }

            let htmlContent = indexHtml

            const stationMatch = path.match(/^\/station\/([^\/]+)/)
            const profileMatch = path.match(/^\/profile\/([^\/]+)/)

            if (stationMatch || profileMatch) {
                // const isBotRequest = isBot(req)
                const isBotRequest = true

                if (isBotRequest) {
                    console.log(`Bot detected for ${path} - injecting OpenGraph metadata`)
                    htmlContent = await injectOpenGraphMetadata(htmlContent, req)
                }
            }

            return new Response(htmlContent, { headers: { 'Content-Type': 'text/html' } })
        },
        development: isDev,
        port: parseInt(process.env.PORT || VITE_PUBLIC_WEB_PORT || '8080'),
        hostname: '0.0.0.0',
    })

    console.log(`🚀 Server running at ${server.url}`)
    console.log(`Environment: ${VITE_PUBLIC_APP_ENV || 'development'}`)
    console.log(`Port: ${server.port}, Hostname: ${server.hostname}`)

    return server
}

let server: ReturnType<typeof serve>

startServer().then((s) => {
    server = s
})

export { server }
