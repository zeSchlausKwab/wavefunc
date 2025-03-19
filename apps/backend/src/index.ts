import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { swagger } from '@elysiajs/swagger'
import { config } from '@wavefunc/common'
import type { NostrEvent } from '@wavefunc/common'

// Get the web app URL for CORS configuration
const WEB_HOST = process.env.PUBLIC_HOST || 'localhost'
const WEB_PORT = process.env.PUBLIC_WEB_PORT || 8080
const PROTOCOL = process.env.NODE_ENV === 'production' ? 'https' : 'http'
const WEB_URL = `${PROTOCOL}://${WEB_HOST}:${WEB_PORT}`

// Create a new Elysia instance with plugins
const app = new Elysia()
    .use(
        cors({
            origin: [WEB_URL, 'http://localhost:8080', `http://${WEB_HOST}:8080`],
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization'],
            credentials: true,
        }),
    )
    .use(
        swagger({
            documentation: {
                info: {
                    title: 'Bun Nostr API',
                    version: '0.1.0',
                    description: 'API for the Bun Nostr application',
                },
            },
        }),
    )
    .get('/', () => {
        return { message: 'Welcome to the Bun Nostr API' }
    })
    .get('/health', () => {
        return { status: 'ok', timestamp: new Date().toISOString() }
    })
    .get('/api/posts', () => {
        const response: NostrEvent[] = [
            {
                id: '1',
                content: 'Hello from the API!',
                pubkey: '123456789abcdef',
                created_at: new Date().getTime(),
                kind: 1,
                tags: [['nostr', 'hello']],
                sig: '123456789abcdef',
            },
        ]

        return response
    })
    .listen(config.server.port)

console.log(`🦊 Elysia is running at http://${config.server.host}:${config.server.port} in ${config.app.env} mode`)
console.log(`📚 Swagger documentation available at http://${config.server.host}:${config.server.port}/swagger`)
console.log(`🔒 CORS configured to allow requests from: ${WEB_URL}`)

export type App = typeof app
