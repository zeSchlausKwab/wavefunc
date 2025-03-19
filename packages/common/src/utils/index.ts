// Helper functions for working with Nostr

/**
 * Formats a timestamp for display
 */
export function formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp * 1000)
    return date.toLocaleString()
}

/**
 * Truncates a public key for display purposes
 */
export function shortenPubkey(pubkey: string): string {
    if (!pubkey || pubkey.length < 8) return pubkey
    return `${pubkey.slice(0, 4)}...${pubkey.slice(-4)}`
}

/**
 * Validates if a string is a valid hex string
 */
export function isValidHex(str: string): boolean {
    return /^[0-9a-f]+$/i.test(str)
}
