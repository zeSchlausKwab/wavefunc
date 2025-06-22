import { useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { NDKEvent, NDKKind } from '@nostr-dev-kit/ndk'
import { queryKeys } from './query-keys'
import { withQueryErrorHandling } from './query-client'
import { ndkActions } from '../lib/store/ndk'

// Zap receipt type
export interface ZapReceipt {
    id: string
    pubkey: string
    created_at: number
    eventId: string // The event that was zapped
    amount: number // Amount in millisats
    preimage?: string
    description?: string
    sender?: string // Pubkey of who sent the zap
    isOurZap?: boolean // Whether this zap was sent by current user
}

/**
 * Parse a zap receipt event into a structured format
 */
function parseZapReceipt(event: NDKEvent, targetEventId: string): ZapReceipt | null {
    try {
        // Get the amount from bolt11 tag or description
        const bolt11Tag = event.tags.find((tag) => tag[0] === 'bolt11')?.[1]
        const descriptionTag = event.tags.find((tag) => tag[0] === 'description')?.[1]
        const preimageTag = event.tags.find((tag) => tag[0] === 'preimage')?.[1]

        let amount = 0
        let sender: string | undefined
        let isOurZap = false

        // Parse the zap request from description to get amount and sender
        if (descriptionTag) {
            try {
                const zapRequest = JSON.parse(descriptionTag)

                // Check if this zap is for our target event
                const isForTargetEvent = zapRequest.tags?.some(
                    (tag: string[]) =>
                        (tag[0] === 'e' && tag[1] === targetEventId) ||
                        (tag[0] === 'a' && tag[1]?.includes(targetEventId)),
                )

                if (!isForTargetEvent) return null

                // Get sender pubkey
                sender = zapRequest.pubkey

                // Get amount from zap request
                const amountTag = zapRequest.tags?.find((tag: string[]) => tag[0] === 'amount')?.[1]
                if (amountTag) {
                    amount = parseInt(amountTag, 10)
                }
            } catch (error) {
                console.warn('Failed to parse zap request description:', error)
            }
        }

        return {
            id: event.id!,
            pubkey: event.pubkey,
            created_at: event.created_at!,
            eventId: targetEventId,
            amount,
            preimage: preimageTag,
            description: descriptionTag,
            sender,
            isOurZap,
        }
    } catch (error) {
        console.error('Error parsing zap receipt:', error)
        return null
    }
}

/**
 * Hook to fetch zap receipts for a specific event
 */
export function useZapReceipts(
    eventId: string,
    since?: number,
    options?: Partial<UseQueryOptions<ZapReceipt[], Error>>,
) {
    return useQuery({
        queryKey: queryKeys.zaps.receipts(eventId, since),
        queryFn: () =>
            withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()
                if (!ndk) {
                    throw new Error('NDK not available')
                }

                const filter = {
                    kinds: [9735 as NDKKind],
                    '#e': [eventId],
                    ...(since && { since }),
                }

                const events = await ndk.fetchEvents(filter)
                const receipts: ZapReceipt[] = []

                for (const event of events) {
                    const receipt = parseZapReceipt(event, eventId)
                    if (receipt) {
                        receipts.push(receipt)
                    }
                }

                // Sort by creation time
                return receipts.sort((a, b) => b.created_at - a.created_at)
            }, 'fetchZapReceipts'),
        enabled: Boolean(eventId),
        staleTime: 30000, // 30 seconds
        ...options,
    })
}

/**
 * Hook to get zap summary statistics for an event
 */
export function useZapSummary(
    eventId: string,
    options?: Partial<UseQueryOptions<{ total: number; count: number }, Error>>,
) {
    return useQuery({
        queryKey: queryKeys.zaps.summary(eventId),
        queryFn: () =>
            withQueryErrorHandling(async () => {
                const ndk = ndkActions.getNDK()
                if (!ndk) {
                    throw new Error('NDK not available')
                }

                const filter = {
                    kinds: [9735 as NDKKind],
                    '#e': [eventId],
                }

                const events = await ndk.fetchEvents(filter)
                let totalAmount = 0
                let count = 0

                for (const event of events) {
                    const receipt = parseZapReceipt(event, eventId)
                    if (receipt) {
                        totalAmount += receipt.amount
                        count++
                    }
                }

                return {
                    total: totalAmount,
                    count,
                }
            }, 'fetchZapSummary'),
        enabled: Boolean(eventId),
        staleTime: 60000, // 1 minute
        ...options,
    })
}

/**
 * Hook to enable real-time updates for zap receipts
 * This should be used in components that need live zap updates
 */
export function useRealtimeZaps(eventId?: string) {
    const queryClient = useQueryClient()

    useEffect(() => {
        const ndk = ndkActions.getNDK()
        if (!ndk) return

        const filter = {
            kinds: [9735 as NDKKind],
            limit: 0, // Get all new events from now on
            ...(eventId && { '#e': [eventId] }),
        }

        const sub = ndk.subscribe(filter)

        sub.on('event', (event: NDKEvent) => {
            try {
                // If we're listening for a specific event, parse and update that cache
                if (eventId) {
                    const receipt = parseZapReceipt(event, eventId)
                    if (receipt) {
                        // Update zap receipts cache
                        queryClient.setQueryData<ZapReceipt[]>(queryKeys.zaps.receipts(eventId), (oldData) => {
                            if (!oldData) return [receipt]

                            // Check if receipt already exists
                            const exists = oldData.some((r) => r.id === receipt.id)
                            if (exists) return oldData

                            // Add new receipt and sort by creation time
                            return [receipt, ...oldData].sort((a, b) => b.created_at - a.created_at)
                        })

                        // Invalidate summary to trigger recalculation
                        queryClient.invalidateQueries({
                            queryKey: queryKeys.zaps.summary(eventId),
                        })
                    }
                } else {
                    // General zap event - find which event it references and update that cache
                    const referencedEvent = event.tags.find((tag) => tag[0] === 'e')?.[1]
                    if (referencedEvent) {
                        const receipt = parseZapReceipt(event, referencedEvent)
                        if (receipt) {
                            queryClient.setQueryData<ZapReceipt[]>(
                                queryKeys.zaps.receipts(referencedEvent),
                                (oldData) => {
                                    if (!oldData) return [receipt]

                                    const exists = oldData.some((r) => r.id === receipt.id)
                                    if (exists) return oldData

                                    return [receipt, ...oldData].sort((a, b) => b.created_at - a.created_at)
                                },
                            )

                            queryClient.invalidateQueries({
                                queryKey: queryKeys.zaps.summary(referencedEvent),
                            })
                        }
                    }
                }
            } catch (error) {
                console.error('[Realtime] Error processing zap event:', error)
            }
        })

        return () => {
            sub.stop()
        }
    }, [queryClient, eventId])
}

/**
 * Hook that combines zap receipts with real-time updates
 * Use this for components that need both initial data and live updates
 */
export function useZapReceiptsWithRealtime(
    eventId: string,
    since?: number,
    options?: Partial<UseQueryOptions<ZapReceipt[], Error>>,
) {
    // Enable real-time updates for this event
    useRealtimeZaps(eventId)

    // Return the query results
    return useZapReceipts(eventId, since, options)
}
