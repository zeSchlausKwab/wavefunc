import type { NDKEvent } from '@nostr-dev-kit/ndk'

export interface NostrComment {
    id: string // Event id
    pubkey: string // Author's pubkey
    content: string // Comment text
    created_at: number // Unix timestamp

    // NIP-22 specific fields
    rootId?: string // ID of the root event being commented on (station)
    rootKind?: number // Kind of the root event
    rootPubkey?: string // Pubkey of the root event author

    parentId?: string // ID of the parent comment (null if direct reply to root)
    parentKind?: number // Kind of the parent event
    parentPubkey?: string // Pubkey of the parent comment author

    // For UI state
    replies?: NostrComment[] // Replies to this comment
    replyingTo?: string // ID of the user this is replying to (for UI)
    isReplyOpen?: boolean // Whether the reply form is open

    // Query system compatibility
    event?: NDKEvent // Full NDKEvent object for compatibility with existing components
}

export interface NostrCommentWithReplies extends NostrComment {
    replies: NostrCommentWithReplies[]
}

export const COMMENT_KIND = 1111

/**
 * Build a tree of comments from a flat list
 */
export function buildCommentTree(comments: NostrComment[]): NostrCommentWithReplies[] {
    // First create a map to deduplicate comments by ID
    const commentMap = new Map<string, NostrCommentWithReplies>()

    // First pass: create all comment objects in the map
    comments.forEach((comment) => {
        // Only add if not already in the map
        if (!commentMap.has(comment.id)) {
            commentMap.set(comment.id, { ...comment, replies: [] })
        }
    })

    // Create a lookup to track which comments are replies
    const childComments = new Set<string>()

    // Track which comments are replies to identify true root comments
    for (const [id, comment] of commentMap.entries()) {
        if (comment.parentId && commentMap.has(comment.parentId)) {
            childComments.add(id)

            // Add this comment as a reply to its parent
            const parent = commentMap.get(comment.parentId)
            if (parent) {
                // Check if reply is already in parent.replies to prevent duplication
                if (!parent.replies.some((reply) => reply.id === comment.id)) {
                    parent.replies.push(comment)
                }
            }
        }
    }

    // Root comments are those not in the childComments set
    const rootComments: NostrCommentWithReplies[] = []
    for (const [id, comment] of commentMap.entries()) {
        if (!childComments.has(id)) {
            // Only add if not already in rootComments to prevent duplication
            if (!rootComments.some((c) => c.id === id)) {
                rootComments.push(comment)
            }
        }
    }

    // Sort all replies by timestamp (newest first)
    for (const [_, comment] of commentMap) {
        comment.replies.sort((a, b) => b.created_at - a.created_at)
    }

    // Sort by timestamp (newest first)
    return rootComments.sort((a, b) => b.created_at - a.created_at)
}
