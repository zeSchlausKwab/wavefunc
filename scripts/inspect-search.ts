#!/usr/bin/env bun
import fs from 'fs'
import path from 'path'
import { URL } from 'url'
import dotenv from 'dotenv'
import { NDKPrivateKeySigner } from '@nostr-dev-kit/ndk'
import NDK from '@nostr-dev-kit/ndk'

// Attempt to load environment variables
try {
    const envPath = path.join(process.cwd(), '.env')
    dotenv.config({ path: envPath })
    console.log('📄 Loaded environment variables from .env file')
} catch (err) {
    console.warn('⚠️ Warning: Could not load .env file:', err)
}

// Get admin credentials
const APP_PRIVATE_KEY = process.env.APP_PRIVATE_KEY
const APP_PUBKEY = process.env.APP_PUBKEY || ''

if (!APP_PRIVATE_KEY) {
    throw Error('Missing APP_PRIVATE_KEY in .env!')
}

if (!APP_PUBKEY) {
    throw Error('Missing APP_PUBKEY in .env!')
}

// Setup NDK with a signer for proper Nostr signatures
const signer = new NDKPrivateKeySigner(APP_PRIVATE_KEY)
const ndk = new NDK({
    signer,
})

/**
 * Sign a message with NDK
 */
async function signMessage(message: string): Promise<string> {
    console.log(`🔏 Signing message: ${message}`)
    // Create a proper NostrEvent object with the minimum required fields
    return await signer.sign({
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: message,
        pubkey: '', // This will be filled in by the signer
    })
}

interface SearchResult {
    query: string
    results: Array<{
        id: string
        pubkey: string
        created_at: number
        kind: number
        name: string
        description: string
        genres: string[]
        match_query: string
    }>
    count: number
    error?: string
}

interface GenreCount {
    genre: string
    count: number
}

/**
 * Sanitize a search term to remove problematic characters
 */
function sanitizeSearchTerm(term: string): string {
    // Trim whitespace
    let clean = term.trim()

    // Check if empty
    if (!clean) {
        return ''
    }

    // Replace problematic characters
    const problematicChars = ['\\', '(', ')', '[', ']', '{', '}', '^', '~', ':', '!', '&', '|']
    problematicChars.forEach((char) => {
        clean = clean.replace(new RegExp('\\' + char, 'g'), ' ')
    })

    // Remove duplicate spaces
    while (clean.includes('  ')) {
        clean = clean.replace(/\s\s+/g, ' ')
    }

    // Final trim
    clean = clean.trim()

    if (clean !== term) {
        console.log(`🔄 Sanitized search term: "${term}" → "${clean}"`)
    }

    return clean
}

/**
 * Make an authenticated admin API call
 */
async function adminApiCall(endpoint: string, method: 'GET' | 'POST' = 'GET', body?: any): Promise<any> {
    const relayUrl = process.env.RELAY_URL || process.env.VITE_PUBLIC_RELAY_URL || 'http://localhost:3002'
    const url = `${relayUrl}${endpoint}`
    const timestamp = new Date().toISOString()

    console.log(`🌐 Making ${method} request to ${url}`)

    // Create headers with authentication
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Admin-Pubkey': APP_PUBKEY,
        'X-Admin-Timestamp': timestamp,
    }

    // Sign the message (method:path:timestamp)
    const signedContent = `${method}:${endpoint}:${timestamp}`
    headers['X-Admin-Signature'] = await signMessage(signedContent)

    // Make the request
    const requestOptions: any = {
        method,
        headers,
    }

    if (body) {
        requestOptions.body = JSON.stringify(body)
    }

    try {
        const response = await fetch(url, requestOptions)

        if (!response.ok) {
            const errorText = await response.text()
            throw new Error(`API call failed with status ${response.status}: ${errorText}`)
        }

        return response
    } catch (error) {
        console.error('❌ Error making admin API call:', error)
        throw error
    }
}

/**
 * Perform a search inspection request to the relay
 */
async function inspectSearch(searchTerm: string, limit: number): Promise<SearchResult> {
    const safeTerm = sanitizeSearchTerm(searchTerm)
    if (!safeTerm) {
        console.error('❌ Error: Search term is empty after sanitization')
        process.exit(1)
    }

    const endpoint = `/admin/inspect-search?q=${encodeURIComponent(safeTerm)}&limit=${limit}`
    console.log(`🔎 Inspecting search index: "${safeTerm}" (limit: ${limit})`)

    try {
        // Connect to NDK
        await ndk.connect()
        console.log('🔌 Connected to NDK')

        // Make authenticated request
        const response = await adminApiCall(endpoint)

        // Get response as text first to print it as we receive it
        const text = await response.text()
        console.log(text)

        // Then parse it as JSON
        const result: SearchResult = JSON.parse(text)
        return result
    } catch (error) {
        console.error('❌ Error inspecting search index:', error)
        throw error
    }
}

/**
 * Print a summary of the search results
 */
function printSearchSummary(result: SearchResult): void {
    if (!result.results || result.results.length === 0) {
        console.log('\n📊 No results found')
        return
    }

    console.log('\n📊 Summary:')
    console.log(`• Found ${result.count} matches for "${result.query}"`)

    if (result.results[0]) {
        const firstMatch = result.results[0]
        console.log(`• First match: ${firstMatch.name || 'Unnamed'} (ID: ${firstMatch.id.substring(0, 8)}...)`)
    }

    // Count genres
    const genreCounts: Record<string, number> = {}
    result.results.forEach((item) => {
        if (item.genres) {
            item.genres.forEach((genre) => {
                genreCounts[genre] = (genreCounts[genre] || 0) + 1
            })
        }
    })

    // Show top genres
    const topGenres: GenreCount[] = Object.entries(genreCounts)
        .map(([genre, count]) => ({ genre, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)

    if (topGenres.length > 0) {
        console.log('\n🏷️ Top genres in results:')
        topGenres.forEach(({ genre, count }) => {
            console.log(`• ${genre}: ${count} stations`)
        })
    }

    // Show a few name samples
    console.log('\n🔤 Sample station names:')
    result.results.slice(0, 5).forEach((station) => {
        console.log(`• ${station.name || 'Unnamed'}`)
    })
}

/**
 * Main function
 */
async function main(): Promise<void> {
    // Parse command line arguments
    const args = process.argv.slice(2)
    let searchTerm = ''
    let limit = 20

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--limit' && i + 1 < args.length) {
            limit = parseInt(args[i + 1], 10)
            i++ // Skip the next argument
        } else {
            searchTerm = args[i]
        }
    }

    if (!searchTerm) {
        console.error('❌ Error: No search term provided')
        console.log('Usage: bun inspect-search.ts "search term"')
        console.log('       bun inspect-search.ts --limit 50 "jazz radio"')
        process.exit(1)
    }

    try {
        const result = await inspectSearch(searchTerm, limit)
        printSearchSummary(result)
    } catch (error) {
        console.error('❌ Error:', error)
        process.exit(1)
    }
}

// Execute main function
main().catch((err) => {
    console.error('❌ Unhandled error:', err)
    process.exit(1)
})
