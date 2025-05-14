/**
 * Format a timestamp to a human readable relative time string
 * @param timestamp Unix timestamp in seconds
 * @returns Formatted relative time string (e.g., "2 hours ago")
 */
export function formatRelativeTime(timestamp: number): string {
    const now = Math.floor(Date.now() / 1000)
    const diff = now - timestamp

    // Less than a minute
    if (diff < 60) {
        return 'just now'
    }

    // Less than an hour
    if (diff < 3600) {
        const minutes = Math.floor(diff / 60)
        return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`
    }

    // Less than a day
    if (diff < 86400) {
        const hours = Math.floor(diff / 3600)
        return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
    }

    // Less than a week
    if (diff < 604800) {
        const days = Math.floor(diff / 86400)
        return `${days} ${days === 1 ? 'day' : 'days'} ago`
    }

    // Less than a month
    if (diff < 2592000) {
        const weeks = Math.floor(diff / 604800)
        return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`
    }

    // Get formatted date
    const date = new Date(timestamp * 1000)
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    })
}
