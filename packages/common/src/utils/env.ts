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
        // For browser, try to get from import.meta.env
        // Note: Vite only exposes env vars that start with VITE_ to the browser
        // @ts-ignore - import.meta.env exists in Vite but TypeScript doesn't know about it
        value = import.meta.env[key]

        // If the key doesn't start with VITE_, try the VITE_ prefixed version
        if (!value && !key.startsWith('VITE_')) {
            // @ts-ignore
            value = import.meta.env[`VITE_${key}`]
        }

        // For PUBLIC_ variables, also check the VITE_PUBLIC_ version
        if (!value && key.startsWith('PUBLIC_')) {
            const vitePublicKey = key.replace('PUBLIC_', 'VITE_PUBLIC_')
            // @ts-ignore
            value = import.meta.env[vitePublicKey]
        }
    } else {
        // Node.js environment - check both process.env and Bun.env
        value = process.env[key] || (typeof Bun !== 'undefined' ? Bun.env[key] : undefined)
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
