import { edenTreaty } from '@elysiajs/eden'
import type { App } from '../../../backend/src/index'

// Get the API URL from the centralized config
const API_HOST = process.env.VITE_PUBLIC_HOST
const API_PORT = process.env.VITE_PUBLIC_API_PORT || 3001
const API_URL = `http://${API_HOST}:${API_PORT}`

// Create a type-safe client for our Elysia backend
export const api = edenTreaty<App>(API_URL)

// Log the API URL for debugging
console.log(`API client configured to use: ${API_URL}`)

// Post interface to match backend data
export interface Post {
    id: string
    content: string
    authorId: string
    createdAt: Date
    tags: string[]
}
