import React from 'react'
import { renderToString } from 'react-dom/server'
import { createServerRouter, AppRouter } from './router'
import index from './index.html'

const server = Bun.serve({
    routes: {
        '/*': index,
    },
    port: process.env.PORT || 3300,
})

console.log(`Server running at http://localhost:${server.port}`)
