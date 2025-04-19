import { Button } from '@/components/ui/button'
import { ndkActions } from '@wavefunc/common'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchRootComments, subscribeToRootComments } from '@wavefunc/common'
import { MessageSquare, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import CommentItem from './CommentItem'
import CreateComment from './CreateComment'
import { NDKEvent } from '@nostr-dev-kit/ndk'

interface CommentsListProps {
    stationEvent: NDKEvent
    stationId: string
    commentsCount: number
}

export default function CommentsList({ stationEvent, stationId, commentsCount }: CommentsListProps) {
    const queryClient = useQueryClient()
    const receivedRootCommentsRef = useRef(new Set<string>())
    const [newCommentCount, setNewCommentCount] = useState(0)

    const {
        data: rootComments,
        isLoading,
        error,
        isError,
    } = useQuery({
        queryKey: ['root-comments', stationId, commentsCount],
        queryFn: async () => {
            const ndk = ndkActions.getNDK()
            if (!ndk) throw new Error('NDK not available')

            try {
                const comments = await fetchRootComments(ndk, stationId)

                comments.forEach((comment) => {
                    if (comment.id) receivedRootCommentsRef.current.add(comment.id)
                })

                return comments
            } catch (error) {
                throw error
            }
        },
        staleTime: 1000 * 60 * 5, // 5 minutes
        retry: 1,
    })

    // Subscribe to new root comments
    useEffect(() => {
        const ndk = ndkActions.getNDK()
        if (!ndk) return

        // Reset state when station changes
        receivedRootCommentsRef.current.clear()
        setNewCommentCount(0)

        // Track if component is mounted
        const isLiveRef = { current: true }

        const subscription = subscribeToRootComments(ndk, stationId, (newComment) => {
            if (!isLiveRef.current || !newComment.id) return

            // Skip if already seen
            if (receivedRootCommentsRef.current.has(newComment.id)) return

            // Track new root comment
            receivedRootCommentsRef.current.add(newComment.id)

            // Increment new comment counter for UI feedback
            setNewCommentCount((prev) => prev + 1)

            // Invalidate query to refresh comments
            queryClient.invalidateQueries({
                queryKey: ['root-comments', stationId, commentsCount],
                exact: true,
            })
        })

        return () => {
            isLiveRef.current = false
            subscription.stop()
        }
    }, [stationId, queryClient, commentsCount])

    const handleRootCommentPosted = () => {
        queryClient.invalidateQueries({
            queryKey: ['root-comments', stationId, commentsCount],
            exact: true,
        })
    }

    return (
        <div className="w-full space-y-4">
            <CreateComment stationEvent={stationEvent} onCommentPosted={handleRootCommentPosted} />

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
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            queryClient.invalidateQueries({
                                queryKey: ['root-comments', stationId, commentsCount],
                                exact: true,
                            })
                        }}
                    >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Retry
                    </Button>
                </div>
            )}

            {!isLoading && !isError && rootComments && rootComments.length === 0 && (
                <div className="text-center py-4">
                    <p className="text-sm text-muted-foreground">No comments yet. Be the first to comment!</p>
                </div>
            )}

            {newCommentCount > 0 && (
                <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                        queryClient.invalidateQueries({
                            queryKey: ['root-comments', stationId, commentsCount],
                            exact: true,
                        })
                        setNewCommentCount(0)
                    }}
                >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Load {newCommentCount} new {newCommentCount === 1 ? 'comment' : 'comments'}
                </Button>
            )}

            <div className="space-y-4 min-h-[100px]">
                {rootComments?.map((comment) => (
                    <CommentItem
                        key={comment.id}
                        comment={comment}
                        stationEvent={stationEvent}
                        stationId={stationId}
                        naddr={stationEvent.id || ''}
                    />
                ))}
            </div>
        </div>
    )
}
