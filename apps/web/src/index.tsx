import { file, serve } from 'bun'
import { config } from 'dotenv'
import { join } from 'path'
import index from './index.html'

// Load environment variables
config({
    path: join(process.cwd(), '../../.env'),
    override: true,
})

const VITE_PUBLIC_APP_ENV = process.env.VITE_PUBLIC_APP_ENV
const VITE_PUBLIC_WEB_PORT = process.env.VITE_PUBLIC_WEB_PORT
const VITE_PUBLIC_HOST = process.env.VITE_PUBLIC_HOST

// Handle static files from the public directory
const serveStatic = async (path: string) => {
    const filePath = join(process.cwd(), 'public', path)
    try {
        const f = file(filePath)
        if (!f.exists()) {
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

export const server = serve({
    routes: {
        '/*': index,
        '/.well-known/nostr.json': () => new Response(file(join(process.cwd(), 'public', '.well-known', 'nostr.json'))),
        '/images/:file': ({ params }) => serveStatic(`images/${params.file}`),
        '/envConfig': () =>
            new Response(JSON.stringify({ VITE_PUBLIC_APP_ENV, VITE_PUBLIC_WEB_PORT, VITE_PUBLIC_HOST }), {
                headers: { 'Content-Type': 'application/javascript' },
            }),
    },
    development: process.env.NODE_ENV !== 'production',
    // Use Railway's PORT env var, fallback to VITE_PUBLIC_WEB_PORT, then 8080
    port: parseInt(process.env.PORT || VITE_PUBLIC_WEB_PORT || '8080'),
    // In production, bind to all available network interfaces
    hostname: '0.0.0.0',
})

console.log(`🚀 Server running at ${server.url}`)
console.log(`Environment: ${VITE_PUBLIC_APP_ENV || 'development'}`)
console.log(`Port: ${server.port}, Hostname: ${server.hostname}`)
