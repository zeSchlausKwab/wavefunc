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
        const err = error as Error
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
    },

    web: {
        port: getEnvVarAsNumber('VITE_PUBLIC_WEB_PORT', 8080),
    },

    server: {
        host: getEnvVar('VITE_PUBLIC_HOST', 'localhost'),
        port: getEnvVarAsNumber('VITE_PUBLIC_API_PORT', 3001),
    },

    databases: {
        primary: {
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

        secondary: {
            connectionString: getEnvVar(
                'POSTGRES_SECONDARY_CONNECTION_STRING',
                'postgres://postgres:postgres@localhost:5433/nostr_events?sslmode=disable',
            ),
            host: getEnvVar('POSTGRES_SECONDARY_HOST', 'localhost'),
            port: getEnvVarAsNumber('POSTGRES_SECONDARY_PORT', 5433),
            user: getEnvVar('POSTGRES_SECONDARY_USER', 'postgres'),
            password: getEnvVar('POSTGRES_SECONDARY_PASSWORD', 'postgres'),
            database: getEnvVar('POSTGRES_SECONDARY_DB', 'nostr_events'),
        },
    },

    relay: {
        port: getEnvVarAsNumber('VITE_PUBLIC_RELAY_PORT', 3002),
        pubkey: getEnvVar('PUBLIC_RELAY_PUBKEY', ''),
        contact: getEnvVar('PUBLIC_RELAY_CONTACT', 'relay@example.com'),
    },

    dvm: {
        privateKey: getEnvVar('DVM_PRIVATE_KEY', ''),
    },

    audd: {
        apiToken: getEnvVar('AUDD_API_TOKEN', ''),
    },

    services: {
        blossom: {
            url: getEnvVar('PUBLIC_BLOSSOM_URL', 'http://localhost:3004'),
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
