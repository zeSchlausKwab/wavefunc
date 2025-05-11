import { file, serve } from 'bun'
import { config } from 'dotenv'
import fs from 'fs'
import { join } from 'path'
import { renderToReadableStream } from 'react-dom/server'
import { buildClient } from './server/build-client'
import { ServerApp } from './server/ServerApp'
import { generateOpenGraphTags } from './server/og'
import { isBot, proxyIcecastRequest, serveStatic } from './server/utils'
import type { EnvConfig } from '@wavefunc/common'

config({
    path: join(process.cwd(), '../../.env'),
    override: true,
})

const isDev = process.env.NODE_ENV !== 'production'

// Helper function to construct EnvConfig from process.env
function getServerEnvConfig(): EnvConfig {
    return {
        VITE_PUBLIC_APP_ENV: process.env.VITE_PUBLIC_APP_ENV || 'development',
        VITE_PUBLIC_WEB_PORT: process.env.VITE_PUBLIC_WEB_PORT || '8080',
        VITE_PUBLIC_HOST: process.env.VITE_PUBLIC_HOST || 'localhost',
        APP_PUBKEY: process.env.APP_PUBKEY || '',
        // Add any other env vars that are part of EnvConfig
    }
}

// Track if we're watching file changes
let isWatching = false

// Function to watch for file changes and rebuild client in dev mode
async function setupFileWatcher() {
    if (isDev && !isWatching) {
        console.log('📺 Setting up file watcher for client rebuilds')
        isWatching = true

        const clientSrcWatcher = fs.watch(join(process.cwd(), 'src'), { recursive: true }, async (event, filename) => {
            if (
                filename &&
                !filename.includes('server/') &&
                !filename.includes('index.tsx') &&
                !filename.startsWith('dist/') &&
                !filename.endsWith('.DS_Store')
            ) {
                console.log(`🔄 Detected change in client-related file ${filename}, rebuilding client...`)
                await buildClient()
            }
        })

        // Also watch common package files
        const commonWatcher = fs.watch(
            join(process.cwd(), '../../packages/common/src'),
            { recursive: true },
            async (event, filename) => {
                if (filename && !filename.endsWith('.DS_Store')) {
                    console.log('🔄 Detected change in common package, rebuilding client...')
                    await buildClient()
                }
            },
        )

        process.on('SIGINT', () => {
            clientSrcWatcher.close()
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

    const serverPort = process.env.PORT || process.env.VITE_PUBLIC_WEB_PORT || '8080'

    const server = serve({
        routes: {
            // Serve /envConfig API endpoint
            '/envConfig': () => {
                const envConfig = getServerEnvConfig()
                console.log('envConfig', envConfig)
                return new Response(JSON.stringify(envConfig), { headers: { 'Content-Type': 'application/json' } })
            },
        },
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
            // Serve .well-known/nostr.json - moved back here
            if (path === '/.well-known/nostr.json') {
                return new Response(file(join(process.cwd(), 'public', '.well-known', 'nostr.json')))
            }
            // /envConfig is now in `routes`

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

            // Determine if the request is for a known static asset or API endpoint.
            // If not, assume it's an application route that needs SSR.
            const isStaticOrApiRoute =
                path.startsWith('/dist/') ||
                path.startsWith('/images/') ||
                path === '/.well-known/nostr.json' ||
                path.startsWith('/api/proxy/icecast')
            // /envConfig is handled by the `routes` object, so it won't reach here.

            // const stationMatch = path.match(/^\/station\/([^\/]+)/) // No longer needed for this check
            // const profileMatch = path.match(/^\/profile\/([^\/]+)/) // No longer needed for this check
            // const isAppRoute = path === '/' || stationMatch || profileMatch
            const isAppRoute = !isStaticOrApiRoute

            if (isAppRoute) {
                try {
                    console.log(`SSR request for ${path}`)
                    const envConfig = getServerEnvConfig()

                    let openGraphTags = ''
                    if (isBot(req)) {
                        console.log(`Bot detected for ${path} - generating OpenGraph metadata`)
                        openGraphTags = await generateOpenGraphTags(req)
                    }

                    const lang = 'en'

                    let headContent = `<!DOCTYPE html>
<html lang="${lang}">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Wavefunc</title>
    ${openGraphTags}
    <link rel="stylesheet" href="/dist/client.css" />
</head>
<body>
    <div id="root">`

                    const tailContent = `</div>
    <script id="env-config-hydration" type="application/json">${JSON.stringify(envConfig)}</script>
    <script type="module" src="/dist/client.js" async></script>
</body>
</html>`

                    const stream = await renderToReadableStream(<ServerApp envConfig={envConfig} />, {
                        bootstrapScripts: ['/dist/client.js'],
                        onError(error) {
                            console.error('React SSR Stream Error:', error)
                        },
                    })

                    const fullStream = new ReadableStream({
                        async start(controller) {
                            const encoder = new TextEncoder()
                            controller.enqueue(encoder.encode(headContent))

                            const reader = stream.getReader()
                            try {
                                while (true) {
                                    const { done, value } = await reader.read()
                                    if (done) break
                                    controller.enqueue(value)
                                }
                            } catch (e) {
                                console.error('Error reading from React stream:', e)
                                controller.error(e)
                            } finally {
                                reader.releaseLock()
                            }

                            controller.enqueue(encoder.encode(tailContent))
                            controller.close()
                        },
                    })

                    return new Response(fullStream, {
                        headers: { 'Content-Type': 'text/html; charset=utf-8' },
                    })
                } catch (error) {
                    console.error(`SSR Error for path ${path}:`, error)
                    return new Response('Server error during SSR', {
                        status: 500,
                        headers: { 'Content-Type': 'text/html' },
                    })
                }
            }

            console.log(`Unhandled path: ${path}, sending 404 from fetch handler`)
            return new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/html' } })
        },
        development: isDev,
        port: parseInt(serverPort),
        hostname: '0.0.0.0',
        error(error) {
            console.error('Bun server error:', error)
            return new Response('Internal Server Error', { status: 500 })
        },
    })

    console.log(`🚀 Server running at ${server.url}`)
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`)
    console.log(`Port: ${server.port}, Hostname: ${server.hostname}`)

    return server
}

let server: ReturnType<typeof serve> | undefined

startServer()
    .then((s) => {
        server = s
    })
    .catch((err) => {
        console.error('Failed to start server:', err)
        process.exit(1)
    })

export { server }
