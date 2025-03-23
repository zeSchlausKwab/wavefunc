import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

/**
 * Generates a random secret token of specified length
 * @param length Length of the token to generate
 * @returns A random alphanumeric string
 */
export function generateSecretToken(length: number = 12): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let result = ''
    const randomValues = new Uint8Array(length)
    crypto.getRandomValues(randomValues)

    for (let i = 0; i < length; i++) {
        result += chars.charAt(randomValues[i] % chars.length)
    }

    return result
}
