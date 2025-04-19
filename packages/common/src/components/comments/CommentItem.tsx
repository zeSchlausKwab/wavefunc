import { NDKEvent } from '@nostr-dev-kit/ndk'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchCommentReplies, ndkActions, subscribeToCommentReplies } from '@wavefunc/common'
import { Button } from '@wavefunc/ui/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@wavefunc/ui/components/ui/card'
import { formatDistanceToNow } from 'date-fns'
import { ChevronDown, ChevronUp, MessageSquare } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { SocialInteractionBar } from '../social/SocialInteractionBar'
import ReplyToComment from './ReplyToComment'
import { UserProfile } from '../UserProfile'

interface CommentItemProps {
    comment: NDKEvent
    stationEvent: NDKEvent
    stationId: string
    naddr: string
    depth?: number
}

export default function CommentItem({ comment, stationEvent, stationId, depth = 0 }: CommentItemProps) {
    const [isReplyOpen, setIsReplyOpen] = useState(false)
    const [showReplies, setShowReplies] = useState(depth < 2) // Auto-expand only first two levels
    const queryClient = useQueryClient()
    const receivedRepliesRef = useRef(new Set<string>())

    // Memoized query key for stability
    const queryKey = useMemo(() => ['comment-replies', comment.id, stationId], [comment.id, stationId])

    // Clear cache when comment or station changes
    useEffect(() => {
        receivedRepliesRef.current.clear()
        queryClient.removeQueries({ queryKey })
    }, [comment.id, stationId, queryKey, queryClient])

    // Query for direct replies to this comment
    const {
        data: replies,
        isLoading: repliesLoading,
        // @ts-ignore
        error: repliesError,
        isError: isRepliesError,
    } = useQuery({
        queryKey,
        queryFn: async () => {
            if (!comment.id) return []

            const ndk = ndkActions.getNDK()
            if (!ndk) throw new Error('NDK not available')

            try {
                const directReplies = await fetchCommentReplies(ndk, comment.id, stationId)

                // Track received replies for deduplication
                directReplies.forEach((reply) => {
                    if (reply.id) receivedRepliesRef.current.add(reply.id)
                })

                return directReplies
            } catch (error) {
                throw error
            }
        },
        enabled: (depth < 2 || showReplies) && !!comment.id,
        staleTime: 1000 * 60 * 5, // 5 minutes
        retry: 1,
    })

    // Subscribe to new replies
    useEffect(() => {
        if (!comment.id) return

        const ndk = ndkActions.getNDK()
        if (!ndk) return

        // Track if component is mounted to prevent updates after unmount
        const isLiveRef = { current: true }

        const subscription = subscribeToCommentReplies(ndk, comment.id, stationId, (newReply) => {
            if (!isLiveRef.current || !newReply.id) return

            // Skip if already seen
            if (receivedRepliesRef.current.has(newReply.id)) return

            // Track new reply
            receivedRepliesRef.current.add(newReply.id)

            // Invalidate query to refresh replies
            queryClient.invalidateQueries({
                queryKey,
                exact: true,
            })
        })

        return () => {
            isLiveRef.current = false
            subscription.stop()
        }
    }, [comment.id, stationId, queryClient, queryKey])

    // Handle posting a new comment
    const handleCommentPosted = () => {
        if (!comment.id) return

        // Invalidate this comment's replies
        setTimeout(() => {
            queryClient.invalidateQueries({
                queryKey,
                exact: true,
            })
        }, 500)
    }

    // Format avatar and timestamp
    // @ts-ignore
    const avatarText = comment.pubkey.slice(0, 2).toUpperCase()
    let timestamp = ''
    try {
        timestamp = formatDistanceToNow(new Date((comment.created_at || 0) * 1000), { addSuffix: true })
    } catch {
        // Fallback formatting if date-fns fails
        timestamp = new Date((comment.created_at || 0) * 1000).toLocaleString()
    }

    // Compute reply count and indentation
    const replyCount = replies?.length || 0
    const maxDepth = 5
    const shouldIndent = depth > 0 && depth < maxDepth

    return (
        <div className={`${shouldIndent ? 'pl-6 border-l border-gray-200 dark:border-gray-700' : ''}`}>
            <Card className="bg-card">
                <CardHeader className="p-4 pb-2 flex flex-row items-center space-y-0">
                    <UserProfile pubkey={comment.pubkey} />
                    <div className="flex flex-col ml-2">
                        <span className="text-xs text-muted-foreground">{timestamp}</span>
                    </div>
                </CardHeader>

                <CardContent className="p-4 pt-2">
                    <p className="whitespace-pre-wrap break-words">{comment.content}</p>
                </CardContent>

                <CardFooter className="p-2 flex justify-between">
                    <SocialInteractionBar
                        event={comment}
                        naddr={comment.id || ''}
                        authorPubkey={comment.pubkey}
                        onCommentClick={() => {
                            setIsReplyOpen(!isReplyOpen)
                        }}
                        compact={true}
                    />

                    {replyCount > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                                e.preventDefault()
                                setShowReplies(!showReplies)
                            }}
                            className="text-xs"
                        >
                            {showReplies ? (
                                <>
                                    <ChevronUp className="h-4 w-4 mr-1" />
                                    Hide Replies ({replyCount})
                                </>
                            ) : (
                                <>
                                    <ChevronDown className="h-4 w-4 mr-1" />
                                    Show Replies ({replyCount})
                                </>
                            )}
                        </Button>
                    )}
                </CardFooter>
            </Card>

            {/* Reply form */}
            <div className={`mt-2 mb-4 transition-all duration-200 ${isReplyOpen ? 'block' : 'hidden'}`}>
                {isReplyOpen && (
                    <ReplyToComment
                        stationEvent={stationEvent}
                        // @ts-ignore
                        parentComment={comment}
                        onCommentPosted={() => {
                            setIsReplyOpen(false)
                            handleCommentPosted()
                        }}
                    />
                )}
            </div>

            {/* Replies section */}
            <div className={`mt-4 space-y-4 transition-all duration-300 ${showReplies ? 'block' : 'hidden'}`}>
                {showReplies && repliesLoading && (
                    <div className="flex justify-center py-2">
                        <MessageSquare className="h-4 w-4 animate-pulse text-muted-foreground" />
                    </div>
                )}

                {showReplies && isRepliesError && (
                    <div className="text-xs text-red-500 py-1 flex items-center justify-between">
                        <span>Failed to load replies</span>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => {
                                if (!comment.id) return
                                queryClient.invalidateQueries({ queryKey, exact: true })
                            }}
                        >
                            Retry
                        </Button>
                    </div>
                )}

                {showReplies &&
                    replies &&
                    replies.length > 0 &&
                    replies.map((reply) => (
                        <CommentItem
                            key={reply.id}
                            comment={reply}
                            stationEvent={stationEvent}
                            stationId={stationId}
                            // TODO: This is a hack to get the naddr for the reply
                            naddr={comment.id || ''}
                            depth={depth + 1}
                        />
                    ))}
            </div>
        </div>
    )
}
