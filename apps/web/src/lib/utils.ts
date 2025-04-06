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
