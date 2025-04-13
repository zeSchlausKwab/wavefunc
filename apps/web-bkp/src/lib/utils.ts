import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import md5 from 'md5'
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

/**
 * Truncates text to a specific length and adds ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
    if (!text) return ''
    if (text.length <= maxLength) return text
    return text.slice(0, maxLength) + '...'
}

/**
 * Generates a consistent color from a hexadecimal string (like a pubkey)
 */
export function getHexColorFingerprintFromHexPubkey(pubkey: string): string {
    if (!pubkey) return '#6665DD'
    // Use just the first 6 chars of md5 hash as hex color
    const hash = md5(pubkey)
    return '#' + hash.substring(0, 6)
}

/**
 * Generates a consistent background color for a station based on its name
 * Returns a lightened version of the color for better readability as a background
 */
export function getStationBackgroundColor(stationName: string, lightenFactor: number = 0.85): string {
    if (!stationName) return '#f4f4f8'

    // Generate a consistent base color using md5 hash
    const hash = md5(stationName)
    const baseColor = '#' + hash.substring(0, 6)

    // Convert hex to RGB
    const r = parseInt(baseColor.slice(1, 3), 16)
    const g = parseInt(baseColor.slice(3, 5), 16)
    const b = parseInt(baseColor.slice(5, 7), 16)

    // Lighten the color by mixing with white based on the factor
    // Higher factor means more white (lighter color)
    const lr = Math.floor(r + (255 - r) * lightenFactor)
    const lg = Math.floor(g + (255 - g) * lightenFactor)
    const lb = Math.floor(b + (255 - b) * lightenFactor)

    // Convert back to hex
    return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`
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
