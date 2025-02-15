import type NDK from '@nostr-dev-kit/ndk'
import { type NDKSubscription, type NDKEvent, type NDKUser } from '@nostr-dev-kit/ndk'

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

import { z } from 'zod'

export const eventSchema = z.object({
  id: z.string().optional(),
  pubkey: z.string(),
  created_at: z.number(),
  kind: z.number(),
  tags: z.array(z.array(z.string())),
  content: z.string(),
  sig: z.string().optional(),
})
