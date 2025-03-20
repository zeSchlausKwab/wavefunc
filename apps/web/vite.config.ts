import tailwindcss from '@tailwindcss/vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { defineConfig } from 'vite'
import dotenv from 'dotenv'

const env = dotenv.config({ path: '../../.env' }).parsed || {}

const API_HOST = import.meta.env.VITE_PUBLIC_HOST
const API_PORT = import.meta.env.VITE_PUBLIC_API_PORT || 3001
const WEB_PORT = import.meta.env.VITE_PUBLIC_WEB_PORT || 8080

// Filter out PUBLIC_ variables
const publicEnvVars = Object.fromEntries(Object.entries(env).filter(([key]) => key.startsWith('VITE_PUBLIC_')))

export default defineConfig({
    plugins: [TanStackRouterVite({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
    resolve: {
        alias: {
            '@': resolve(__dirname, './src'),
        },
    },
    define: {
        // Expose all PUBLIC_ variables to import.meta.env
        ...Object.fromEntries(
            Object.entries(publicEnvVars).map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)]),
        ),
    },
    server: {
        port: WEB_PORT,
        host: API_HOST,
        strictPort: true,
        hmr: {
            port: API_PORT,
            host: API_HOST,
        },
    },
    clearScreen: false,
    logLevel: 'info',
})
