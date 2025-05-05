import NDK, { NDKPrivateKeySigner } from '@nostr-dev-kit/ndk'
import * as dotenv from 'dotenv'

// Load .env
dotenv.config({ path: '../.env' })

// Get admin credentials
const APP_PRIVATE_KEY = process.env.APP_PRIVATE_KEY
const APP_PUBKEY = process.env.APP_PUBKEY || ''

if (!APP_PRIVATE_KEY) {
    throw Error('Missing ADMIN_PRIVATE_KEY in .env!')
}

if (!APP_PUBKEY) {
    throw Error('Missing ADMIN_PUBKEY in .env!')
}

// Get relay URL from environment
const relayUrl = 'https://relay.wavefunc.live'
// const relayUrl = 'http://localhost:3002'
// Setup NDK with a signer for proper Nostr signatures
const signer = new NDKPrivateKeySigner(APP_PRIVATE_KEY)
const ndk = new NDK({
    signer,
})

/**
 * Sign a message with NDK
 */
async function signMessage(message: string): Promise<string> {
    console.log(`Signing message: ${message}`)
    // Create a proper NostrEvent object with the minimum required fields
    return await signer.sign({
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: message,
        pubkey: '', // This will be filled in by the signer
    })
}

/**
 * Make an authenticated admin API call
 */
async function adminApiCall(endpoint: string, method: 'GET' | 'POST' = 'GET', body?: any): Promise<any> {
    const url = `${relayUrl}${endpoint}`
    const timestamp = new Date().toISOString()

    console.log(`Making ${method} request to ${url}`)

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

        return await response.json()
    } catch (error) {
        console.error('Error making admin API call:', error)
        throw error
    }
}

/**
 * Reset and reindex the search index
 */
async function resetSearchIndex(): Promise<void> {
    try {
        const result = await adminApiCall('/admin/reset-search-index', 'POST')
        console.log('Reset search index initiated:', result)

        // Poll for status
        let isIndexing = true
        console.log('Polling for indexing status...')

        while (isIndexing) {
            await new Promise((resolve) => setTimeout(resolve, 5000)) // Wait 5 seconds

            const status = await adminApiCall('/admin/indexing-status')
            console.log(`Indexing status: ${status.status} (${status.percent.toFixed(2)}%)`)

            isIndexing = status.isIndexing
        }

        console.log('Indexing completed!')
    } catch (error) {
        console.error('Failed to reset search index:', error)
    }
}

/**
 * Test the admin authentication
 */
async function testAuth(): Promise<void> {
    try {
        const result = await adminApiCall('/admin/test-auth')
        console.log('Authentication test result:', result)
    } catch (error) {
        console.error('Authentication test failed:', error)
    }
}

/**
 * Check the indexing status
 */
async function checkIndexingStatus(): Promise<void> {
    try {
        const status = await adminApiCall('/admin/indexing-status')
        console.log('Current indexing status:', status)
    } catch (error) {
        console.error('Failed to get indexing status:', error)
    }
}

/**
 * Main function to parse command line args and run the appropriate function
 */
async function main(): Promise<void> {
    const args = process.argv.slice(2)
    const command = args[0]

    await ndk.connect()

    switch (command) {
        case 'reset-index':
            await resetSearchIndex()
            break

        case 'status':
            await checkIndexingStatus()
            break

        case 'test-auth':
            await testAuth()
            break

        default:
            console.log(`
Admin Tools for Wavefunc Relay

Usage:
  bun admin-nostr.ts [command]

Commands:
  reset-index   Reset and reindex the search index
  status        Check the current indexing status
  test-auth     Test the admin authentication

Environment variables:
  VITE_PUBLIC_RELAY_URL  URL of the relay (default: http://localhost:3002)
  APP_PRIVATE_KEY      Private key for authentication
  APP_PUBKEY           Public key corresponding to the private key
`)
            break
    }
}

// Run the main function
main().catch((error) => {
    console.error('Error:', error)
    process.exit(1)
})
