import React from 'react'
import { renderToString } from 'react-dom/server'
import { createServerRouter, AppRouter } from './router'

const server = Bun.serve({
    port: process.env.PORT || 3300,
    async fetch(req) {
        const url = new URL(req.url)

        // Serve static files from public directory
        if (url.pathname.startsWith('/build/')) {
            const filePath = url.pathname.replace('/build/', '')
            const file = Bun.file(`./public/build/${filePath}`)

            if (await file.exists()) {
                return new Response(file)
            }
        }

        // Handle favicon request
        if (url.pathname === '/favicon.ico') {
            const file = Bun.file('./public/favicon.ico')
            if (await file.exists()) {
                return new Response(file)
            }
            return new Response(null, { status: 404 })
        }

        // Initialize the router for server-side rendering
        const router = createServerRouter(url.pathname)
        
        // Wait for the router to be ready
        await router.load()

        // Server-side render the React app
        const appHtml = renderToString(
            <AppRouter router={router} />
        )

        return new Response(
            `<!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Wavefunc - SSR</title>
          <script src="/build/client.js" defer></script>
          <link rel="stylesheet" href="/build/styles.css">
        </head>
        <body>
          <div id="root">${appHtml}</div>
        </body>
      </html>`,
            {
                headers: {
                    'Content-Type': 'text/html',
                },
            },
        )
    },
})

console.log(`Server running at http://localhost:${server.port}`)
