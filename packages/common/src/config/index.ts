import { getEnvVar, getEnvVarAsNumber, isBrowser } from '../utils/env'
import path from 'path'
import fs from 'fs'

/**
 * Loads environment variables from the root .env file
 * This ensures all packages use the same environment variables
 * Note: This only works in Node.js environments, not in the browser
 */
function loadRootEnvFile() {
    // Skip in browser environment
    if (isBrowser) {
        console.log('Browser environment detected, skipping .env file loading')
        return false
    }

    try {
        // Attempt to find the root directory by looking for package.json
        let currentDir = process.cwd()
        let rootDir = currentDir

        // Try to find a package.json with "workspaces" field which indicates the monorepo root
        while (currentDir !== path.parse(currentDir).root) {
            const packageJsonPath = path.join(currentDir, 'package.json')
            if (fs.existsSync(packageJsonPath)) {
                const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
                if (packageJson.workspaces) {
                    rootDir = currentDir
                    break
                }
            }
            currentDir = path.dirname(currentDir)
        }

        // Load the .env file from the root directory
        const envPath = path.join(rootDir, '.env')
        if (fs.existsSync(envPath)) {
            console.log(`Loading environment from root .env file: ${envPath}`)

            return true
        } else {
            console.warn(`No .env file found at root: ${envPath}`)
            return false
        }
    } catch (error: unknown) {
        // const err = error as Error
        // console.error(`Error loading root .env file: ${err.message}`)
        return false
    }
}

// Load root .env file when this module is imported (only in Node.js)
if (!isBrowser) {
    loadRootEnvFile()
}

/**
 * Centralized application configuration for the entire monorepo
 * This reads from a single source of truth (environment variables)
 * and provides consistent configuration to all packages
 */
export const config = {
    app: {
        env: getEnvVar('VITE_PUBLIC_APP_ENV', 'development'),
        isProd: getEnvVar('VITE_PUBLIC_APP_ENV', 'development') === 'production',
        isDev: getEnvVar('VITE_PUBLIC_APP_ENV', 'development') === 'development',
        pubkey: getEnvVar('VITE_APP_PUBKEY', ''),
        privateKey: getEnvVar('APP_PRIVATE_KEY', ''),
        userAgent: getEnvVar('APP_USER_AGENT', 'WaveFunc/1.0'),
        baseUrl: getEnvVar('PUBLIC_BASE_URL', 'https://wavefunc.live'),
        logoUrl: getEnvVar('APP_LOGO_URL', 'https://wavefunc.live/images/logo.png'),
        nip05Verification: getEnvVar('NIP05_VERIFICATION', 'Wavefunc@wavefunc.live'),
    },

    publicKeys: {
        featured: getEnvVar('FEATURED_STATIONS_PUBKEY', ''),
        dvmcpFallback: getEnvVar('DVMCP_FALLBACK_PUBKEY', ''),
    },

    web: {
        port: getEnvVarAsNumber('VITE_PUBLIC_WEB_PORT', 8080),
    },

    server: {
        host: getEnvVar('VITE_PUBLIC_HOST', 'localhost'),
        port: getEnvVarAsNumber('VITE_PUBLIC_API_PORT', 3001),
    },

    database: {
        connectionString: getEnvVar(
            'POSTGRES_CONNECTION_STRING',
            'postgres://postgres:postgres@localhost:5432/nostr?sslmode=disable',
        ),
        host: getEnvVar('POSTGRES_HOST', 'localhost'),
        port: getEnvVarAsNumber('POSTGRES_PORT', 5432),
        user: getEnvVar('POSTGRES_USER', 'postgres'),
        password: getEnvVar('POSTGRES_PASSWORD', 'postgres'),
        database: getEnvVar('POSTGRES_DB', 'nostr'),
    },

    relay: {
        port: getEnvVarAsNumber('VITE_PUBLIC_RELAY_PORT', 3002),
        privateKey: getEnvVar('RELAY_PRIVATE_KEY', ''),
    },

    nostr: {
        relayUrls: getEnvVar('NOSTR_RELAY_URLS', '').split(',').filter(Boolean),
        defaultRelayUrls: getEnvVar('DEFAULT_RELAY_URLS', '').split(',').filter(Boolean),
        connectRelayUrl: getEnvVar('NOSTR_CONNECT_RELAY_URL', 'wss://relay.nsec.app/'),
    },

    dvm: {
        privateKey: getEnvVar('DVM_PRIVATE_KEY', ''),
        relayUrls: getEnvVar('DVM_RELAY_URLS', ''),
        lightningAddress: getEnvVar('DVM_LIGHTNING_ADDRESS', ''),
        zapRelays: getEnvVar('DVM_LIGHTNING_ZAP_RELAYS', ''),
    },

    audd: {
        apiToken: getEnvVar('AUDD_API_TOKEN', ''),
        apiUrl: getEnvVar('AUDD_API_URL', 'https://api.audd.io/'),
    },

    discogs: {
        personalAccessToken: getEnvVar('DISCOGS_PA_TOKEN', ''),
        apiUrl: getEnvVar('DISCOGS_API_URL', 'https://api.discogs.com/'),
    },

    musicbrainz: {
        apiUrl: getEnvVar('MUSICBRAINZ_API_URL', 'https://musicbrainz.org/ws/2/'),
    },

    radioBrowser: {
        apiUrl: getEnvVar('RADIO_BROWSER_API_URL', 'https://de2.api.radio-browser.info/json/stations'),
    },

    defaults: {
        stationImageUrl: getEnvVar('DEFAULT_STATION_IMAGE_URL', 'https://picsum.photos/seed/no-station/200/200'),
        featuredImageUrl: getEnvVar(
            'DEFAULT_FEATURED_IMAGE_URL',
            'https://images.wallpaperscraft.ru/image/single/gitarist_muzykant_kontsert_122198_1920x1080.jpg',
        ),
    },

    services: {
        blossom: {
            url: getEnvVar('PUBLIC_BLOSSOM_URL', 'http://localhost:3004'),
        },
    },

    // Composed/derived configurations
    urls: {
        // Local development URLs
        get localRelay() {
            const host = getEnvVar('VITE_PUBLIC_HOST', 'localhost')
            const port = getEnvVarAsNumber('VITE_PUBLIC_RELAY_PORT', 3002)
            return `ws://${host}:${port}`
        },

        get localApi() {
            const host = getEnvVar('VITE_PUBLIC_HOST', 'localhost')
            const port = getEnvVarAsNumber('VITE_PUBLIC_API_PORT', 3001)
            return `http://${host}:${port}`
        },

        get localWeb() {
            const host = getEnvVar('VITE_PUBLIC_HOST', 'localhost')
            const port = getEnvVarAsNumber('VITE_PUBLIC_WEB_PORT', 8080)
            return `http://${host}:${port}`
        },

        // Application URLs
        get stationUrl() {
            const baseUrl = getEnvVar('PUBLIC_BASE_URL', 'https://wavefunc.live')
            return (bech32: string) => `${baseUrl}/station/${bech32}`
        },

        get profileUrl() {
            const baseUrl = getEnvVar('PUBLIC_BASE_URL', 'https://wavefunc.live')
            return (bech32: string) => `${baseUrl}/profile/${bech32}`
        },

        get adminApiEndpoint() {
            const baseUrl = getEnvVar('PUBLIC_BASE_URL', 'https://wavefunc.live')
            return `${baseUrl.replace('https://', 'wss://').replace('http://', 'ws://')}/admin/publish-handler`
        },
    },

    /**
     * Reload the environment from the root .env file
     * Useful if the .env file has been modified during runtime
     * Note: This only works in Node.js environments
     */
    reloadEnv() {
        if (isBrowser) {
            console.warn('Cannot reload environment in browser context')
            return false
        }
        return loadRootEnvFile()
    },

    /**
     * Load the full environment variables
     * Useful for accessing variables that aren't
     * explicitly defined in the config object
     */
    loadFullEnv() {
        if (isBrowser) {
            // @ts-ignore
            return { ...import.meta.env }
        }
        return { ...process.env, ...(typeof Bun !== 'undefined' ? Bun.env : {}) }
    },
}

/**
 * Re-export config as default for easier imports
 */
export default config
