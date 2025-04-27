import { file, serve } from 'bun'
import { config } from 'dotenv'
import fs from 'fs'
import { join } from 'path'
import { buildClient } from './server/build-client'
import { isBot, serveStatic } from './server/utils'
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

async function startServer() {
    await buildClient()

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

            let htmlContent = indexHtml
            const isBotRequest = isBot(req)

            console.log(`Bot ${isBotRequest ? 'detected' : 'not detected'} for ${path}`)

            if (isBotRequest) {
                console.log(`Bot detected for ${path} - injecting OpenGraph metadata`)
                htmlContent = await injectOpenGraphMetadata(htmlContent, req)
            }

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
