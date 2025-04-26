import { NDKEvent } from '@nostr-dev-kit/ndk'
import { useQuery } from '@tanstack/react-query'
import { fetchStationComments, getRootComments, ndkActions, subscribeToComments } from '@wavefunc/common'
import { Button } from '@wavefunc/ui/components/ui/button'
import { MessageSquare, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import CommentItem from './CommentItem'
import CreateComment from './CreateComment'

interface CommentsListProps {
    stationEvent: NDKEvent
    stationId: string
    commentsCount: number
}

export default function CommentsList({ stationEvent, stationId, commentsCount }: CommentsListProps) {
    const [allComments, setAllComments] = useState<NDKEvent[]>([])
    const processedIds = useRef(new Set<string>())
    const subscriptionRef = useRef<{ stop: () => void } | null>(null)

    // Load all comments for the station
    const { isLoading, error, isError, refetch } = useQuery({
        queryKey: ['station-comments', stationId, commentsCount],
        queryFn: async () => {
            const ndk = ndkActions.getNDK()
            if (!ndk) throw new Error('NDK not available')

            // Fetch all comments for this station
            const comments = await fetchStationComments(ndk, stationId)

            // Update our processed IDs set to avoid duplicates
            comments.forEach((comment) => {
                if (comment.id) processedIds.current.add(comment.id)
            })

            // Update state with all comments
            setAllComments(comments)

            return comments
        },
        staleTime: 1000 * 60, // 1 minute
        retry: 1,
    })

    // Subscribe to new comments
    useEffect(() => {
        const ndk = ndkActions.getNDK()
        if (!ndk) return

        // Clean up previous subscription
        if (subscriptionRef.current) {
            subscriptionRef.current.stop()
            subscriptionRef.current = null
        }

        // Reset state when station changes
        processedIds.current.clear()

        // Subscribe to all new comments
        const subscription = subscribeToComments(ndk, stationId, (newComment) => {
            if (!newComment.id) return

            // Skip if we've already processed this comment
            if (processedIds.current.has(newComment.id)) return
            processedIds.current.add(newComment.id)

            // Add new comment to our state
            setAllComments((prev) => {
                // Double-check it's not already in the list
                if (prev.some((c) => c.id === newComment.id)) return prev
                return [...prev, newComment]
            })
        })

        // Store subscription for cleanup
        subscriptionRef.current = subscription

        return () => {
            if (subscriptionRef.current) {
                subscriptionRef.current.stop()
                subscriptionRef.current = null
            }
        }
    }, [stationId])

    // When new comment is posted, refresh the list
    const handleCommentPosted = () => {
        refetch()
    }

    // Get only root comments for the first level of display
    const rootComments = allComments.length > 0 ? getRootComments(allComments) : []

    return (
        <div className="w-full space-y-4">
            <CreateComment stationEvent={stationEvent} onCommentPosted={handleCommentPosted} />

            {isLoading && (
                <div className="flex justify-center py-6">
                    <MessageSquare className="h-5 w-5 animate-pulse text-muted-foreground" />
                </div>
            )}

            {isError && (
                <div className="flex flex-col items-center gap-2 py-6">
                    <p className="text-sm text-muted-foreground">
                        Failed to load comments: {error instanceof Error ? error.message : 'Unknown error'}
                    </p>
                    <Button variant="outline" size="sm" onClick={() => refetch()}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Retry
                    </Button>
                </div>
            )}

            {!isLoading && !isError && rootComments.length === 0 && (
                <div className="text-center py-4">
                    <p className="text-sm text-muted-foreground">No comments yet. Be the first to comment!</p>
                </div>
            )}

            <div className="space-y-4 min-h-[100px]">
                {rootComments.map((comment) => (
                    <CommentItem
                        key={comment.id}
                        comment={comment}
                        stationEvent={stationEvent}
                        stationId={stationId}
                        naddr={stationEvent.id || ''}
                        allComments={allComments}
                        onReplyPosted={handleCommentPosted}
                    />
                ))}
            </div>
        </div>
    )
}
