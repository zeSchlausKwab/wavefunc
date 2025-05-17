import type { EnvConfig } from '@wavefunc/common'
import { file, serve, spawnSync } from 'bun'
import { config } from 'dotenv'
import fs from 'fs'
import { join } from 'path'
import { renderToReadableStream } from 'react-dom/server'
import { generateOpenGraphTags } from './server/og'
import { ServerApp } from './server/ServerApp'
import { isBot, proxyIcecastRequest, serveStatic } from './server/utils'

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
        VITE_APP_PUBKEY: process.env.VITE_APP_PUBKEY || '',
        // Add any other env vars that are part of EnvConfig
    }
}

async function startServer() {
    const serverPort = process.env.PORT || process.env.VITE_PUBLIC_WEB_PORT || '8080'

    if (isDev) {
        console.log('🔄 Starting development server...')
        console.log('🛠️ Running development build script (apps/web/build.ts)...')
        const buildProcess = spawnSync({
            cmd: ['bun', 'build.ts'],
            cwd: process.cwd(),
            stdout: 'inherit',
            stderr: 'inherit',
            stdin: 'inherit',
        })

        if (buildProcess.exitCode === 0) {
            console.log('✅ Development build script completed successfully.')
        } else {
            console.error(`❌ Development build script failed with exit code ${buildProcess.exitCode}.`)
        }
    } else {
        console.log('🚀 Starting production server...')
    }

    const server = serve({
        routes: {
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
            if (path === '/.well-known/nostr.json') {
                return new Response(file(join(process.cwd(), 'public', '.well-known', 'nostr.json')))
            }

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
                path.startsWith('/favicon.ico') ||
                path === '/.well-known/nostr.json' ||
                path.startsWith('/api/proxy/icecast')

            // const stationMatch = path.match(/^\/station\/([^\/]+)/) // No longer needed for this check
            // const profileMatch = path.match(/^\/profile\/([^\/]+)/) // No longer needed for this check
            // const isAppRoute = path === '/' || stationMatch || profileMatch
            const isAppRoute = !isStaticOrApiRoute

            if (isAppRoute) {
                try {
                    console.log(`SSR request for ${path}`)
                    const envConfig = getServerEnvConfig()

                    let openGraphTags = ''
                    // TODO: Remove this once we have a way to detect bots
                    // const isBotReq = isBot(req)
                    const isBotReq = true
                    if (isBotReq) {
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
