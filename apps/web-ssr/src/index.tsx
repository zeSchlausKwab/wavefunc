import { file, serve } from 'bun'
import { config } from 'dotenv'
import { join } from 'path'
import index from './index.html'

import.meta.hot.accept()

config()

const VITE_PUBLIC_API_PORT = process.env.VITE_PUBLIC_API_PORT

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
        '/images/:file': ({ params }) => serveStatic(`images/${params.file}`),
    },
    development: process.env.NODE_ENV !== 'production',
})

console.log(`🚀 Server running at ${server.url}`)
