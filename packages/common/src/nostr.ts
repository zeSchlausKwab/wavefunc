import type NDK from '@nostr-dev-kit/ndk'
import { type NDKEvent, type NDKSubscription } from '@nostr-dev-kit/ndk'
import { z } from 'zod'

/**
 * Generate a deterministic color from a pubkey
 * @param pubkey - Nostr public key
 * @returns HSL color string
 */
export function getPubkeyColor(pubkey: string): string {
    const hue = pubkey.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360
    return `hsl(${hue}, 70%, 45%)`
}

/**
 * Format pubkey to show first and last 4 chars
 * @param pubkey - Nostr public key
 * @returns Formatted pubkey string (e.g., "1234...5678")
 */
export function formatPubkey(pubkey: string): string {
    return `${pubkey.slice(0, 4)}...${pubkey.slice(-4)}`
}

export type FollowingUpdate = {
    type: 'add' | 'complete'
    pubkey?: string
}

export function subscribeToFollowingList(
    ndk: NDK,
    targetPubkey: string,
    maxFollowers: number,
    onUpdate: (update: FollowingUpdate) => void,
): () => void {
    let subscription: NDKSubscription | undefined
    let followersCount = 0

    const cleanup = () => {
        if (subscription) {
            subscription.stop()
            subscription = undefined
        }
    }

    const timeoutId = setTimeout(() => {
        onUpdate({ type: 'complete' })
        cleanup()
    }, 5000)

    const processContactList = async () => {
        subscription = ndk.subscribe(
            {
                kinds: [3],
                authors: [targetPubkey],
            },
            { closeOnEose: false },
        )

        subscription.on('event', (event: NDKEvent) => {
            const tags = event.tags
            tags.forEach((tag) => {
                if (tag[0] === 'p' && followersCount < maxFollowers) {
                    followersCount++
                    onUpdate({ type: 'add', pubkey: tag[1] })
                }
            })
        })
    }

    processContactList()

    return () => {
        clearTimeout(timeoutId)
        cleanup()
    }
}

export const eventSchema = z.object({
    id: z.string().optional(),
    pubkey: z.string(),
    created_at: z.number(),
    kind: z.number(),
    tags: z.array(z.array(z.string())),
    content: z.string(),
    sig: z.string().optional(),
})
