/**
 * Environment variable utilities for both Node.js and browser environments
 */

/**
 * Determines if code is running in a browser environment
 */
export const isBrowser = typeof window !== 'undefined' && typeof process === 'undefined'

/**
 * Gets an environment variable and validates it exists
 * Works in both Node.js and browser environments
 *
 * @param key The name of the environment variable
 * @param defaultValue Optional default value if not found
 * @returns The value of the environment variable
 * @throws Error if the environment variable is not defined and no default is provided
 */
export function getEnvVar(key: string, defaultValue?: string): string {
    let value: string | undefined

    // Handle browser environment (Vite uses import.meta.env)
    if (isBrowser) {
        // // For browser, try to get from import.meta.env
        // // Note: Vite prefixes env vars with VITE_
        // const viteKey = key.startsWith('VITE_') ? key : `VITE_${key}`
        // // @ts-ignore - import.meta.env exists in Vite but TypeScript doesn't know about it
        // value = import.meta.env[viteKey] || import.meta.env[key]
        // // For PUBLIC_ variables, also check without the prefix
        // if (!value && key.startsWith('PUBLIC_')) {
        //     const unprefixedKey = key.replace('PUBLIC_', '')
        //     // @ts-ignore
        //     value = import.meta.env[`VITE_${unprefixedKey}`] || import.meta.env[unprefixedKey]
        // }
    } else {
        // Node.js environment
    }

    // Use default value if provided and value is undefined
    if (value === undefined) {
        if (defaultValue !== undefined) {
            return defaultValue
        }
        throw new Error(`Environment variable ${key} is not defined`)
    }

    return value
}

/**
 * Gets an environment variable as a number
 * @param key The name of the environment variable
 * @param defaultValue Optional default value if not found
 * @returns The numeric value of the environment variable
 * @throws Error if the environment variable is not a valid number
 */
export function getEnvVarAsNumber(key: string, defaultValue?: number): number {
    const stringValue = getEnvVar(key, defaultValue?.toString())
    const numValue = Number(stringValue)

    if (isNaN(numValue)) {
        throw new Error(`Environment variable ${key} is not a valid number`)
    }

    return numValue
}

/**
 * Gets an environment variable as a boolean
 * @param key The name of the environment variable
 * @param defaultValue Optional default value if not found
 * @returns The boolean value of the environment variable
 */
export function getEnvVarAsBoolean(key: string, defaultValue?: boolean): boolean {
    const stringValue = getEnvVar(key, defaultValue?.toString()).toLowerCase()
    return stringValue === 'true' || stringValue === '1' || stringValue === 'yes'
}

/**
 * Gets a database connection string
 * @returns The primary database connection string
 */
export function getPrimaryDbConnectionString(): string {
    return getEnvVar('POSTGRES_CONNECTION_STRING')
}

/**
 * Gets the secondary database connection string
 * @returns The secondary database connection string
 */
export function getSecondaryDbConnectionString(): string {
    return getEnvVar('POSTGRES_SECONDARY_CONNECTION_STRING')
}

/**
 * Returns an object with all environment variables
 * Note: In browser environments, this will only return Vite-exposed variables
 */
export function loadEnv() {
    if (isBrowser) {
        // @ts-ignore
        return { ...import.meta.env }
    }

    // Node.js environment
    return { ...process.env, ...(typeof Bun !== 'undefined' ? Bun.env : {}) }
}
