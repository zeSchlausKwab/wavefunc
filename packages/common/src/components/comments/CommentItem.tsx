import { NDKEvent, NDKKind } from '@nostr-dev-kit/ndk'
import { useQuery } from '@tanstack/react-query'
import type { QueryKey } from '@tanstack/react-query'
import { ndkActions } from '@wavefunc/common'
import { Card, CardContent, CardFooter, CardHeader } from '@wavefunc/ui/components/ui/card'
import { formatDistanceToNow } from 'date-fns'
import { CornerDownRight, Loader2, MessageSquare } from 'lucide-react'
import { useState, useMemo, useEffect } from 'react'
import { SocialInteractionBar } from '../social/SocialInteractionBar'
import { UserProfile } from '../UserProfile'
import ReplyToComment from './ReplyToComment'

interface CommentItemProps {
    comment: NDKEvent
    stationEvent: NDKEvent
    stationId: string
    initialExpandDepth?: number
}

export default function CommentItem({ comment, stationEvent, stationId, initialExpandDepth = 0 }: CommentItemProps) {
    const [isReplyFormOpen, setIsReplyFormOpen] = useState(false)
    const [showReplies, setShowReplies] = useState(initialExpandDepth > 0)

    const ndk = ndkActions.getNDK()

    const queryKey: QueryKey = useMemo(() => ['comment-replies', comment.id], [comment.id])

    const fetchRepliesFn = async (): Promise<NDKEvent[]> => {
        if (!ndk || !comment.id) return []
        const filter = {
            kinds: [1111],
            '#e': [comment.id],
            limit: 50,
        }
        const fetchedReplyEvents = await ndk.fetchEvents(filter)
        const repliesArray = Array.from(fetchedReplyEvents.values())
        repliesArray.sort((a, b) => (a.created_at || 0) - (b.created_at || 0))
        return repliesArray
    }

    const {
        data: repliesData,
        isLoading: isLoadingReplies,
        refetch: refetchReplies,
        isFetched,
    } = useQuery<NDKEvent[], Error>({
        queryKey: queryKey,
        queryFn: fetchRepliesFn,
        enabled: !!ndk && !!comment.id,
        staleTime: 1000 * 60 * 5,
    })

    const numReplies = repliesData?.length || 0

    useEffect(() => {
        if (initialExpandDepth > 0 && isFetched && !showReplies && numReplies > 0) {
            setShowReplies(true)
        }
    }, [initialExpandDepth, isFetched, showReplies, numReplies])

    const timestamp = useMemo(() => {
        try {
            return formatDistanceToNow(new Date((comment.created_at || 0) * 1000), { addSuffix: true })
        } catch {
            return new Date((comment.created_at || 0) * 1000).toLocaleString()
        }
    }, [comment.created_at])

    const handleReplyPosted = () => {
        setIsReplyFormOpen(false)
        if (!showReplies) {
            setShowReplies(true)
        } else {
            refetchReplies()
        }
    }

    const toggleReplyForm = () => {
        const newIsReplyFormOpen = !isReplyFormOpen
        setIsReplyFormOpen(newIsReplyFormOpen)
        if (newIsReplyFormOpen && !showReplies) {
            setShowReplies(true)
        }
    }

    const toggleShowRepliesManual = () => {
        setShowReplies(!showReplies)
    }

    const showHideButtonVisible = numReplies > 0 || isLoadingReplies || (isFetched && numReplies === 0)
    let buttonText = ''
    if (showReplies) {
        buttonText = `Hide${numReplies > 0 ? ` ${numReplies}` : ''} ${numReplies === 1 ? 'reply' : 'replies'}`
            .replace(' 0 replies', '')
            .replace('  ', ' ')
            .trim()
        if (numReplies === 0 && !isLoadingReplies) buttonText = 'Hide replies'
    } else {
        if (isLoadingReplies) {
            buttonText = 'Loading...'
        } else if (numReplies > 0) {
            buttonText = `Show ${numReplies} ${numReplies === 1 ? 'reply' : 'replies'}`
        } else {
            buttonText = 'View replies'
        }
    }

    return (
        <div className="relative">
            <Card className="bg-card mb-2 last:mb-0">
                <CardHeader className="p-3 pb-1 flex flex-row items-center space-y-0">
                    <UserProfile pubkey={comment.pubkey} compact={true} />
                    <div className="flex flex-col ml-2">
                        <span className="text-xs text-muted-foreground font-medium">
                            {comment.author?.profile?.displayName ||
                                comment.author?.profile?.name ||
                                comment.pubkey.slice(0, 12) + '...'}
                        </span>
                        <span className="text-xs text-muted-foreground">{timestamp}</span>
                    </div>
                </CardHeader>

                <CardContent className="p-3 pt-1">
                    <p className="whitespace-pre-wrap break-words text-sm">{comment.content}</p>
                </CardContent>

                <CardFooter className="p-2 pt-0 flex justify-between items-center">
                    <SocialInteractionBar
                        event={comment}
                        naddr={comment.id || ''}
                        authorPubkey={comment.pubkey}
                        onCommentClick={toggleReplyForm}
                        commentsCount={numReplies}
                        compact={true}
                    />

                    {showHideButtonVisible && (
                        <button
                            onClick={toggleShowRepliesManual}
                            className="text-xs text-muted-foreground hover:text-primary flex items-center p-1 rounded-md"
                        >
                            {isLoadingReplies && showReplies ? (
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                                <CornerDownRight className="h-3 w-3 mr-1" />
                            )}
                            {buttonText}
                        </button>
                    )}
                </CardFooter>

                {showReplies && (
                    <div
                        className={`transition-all duration-300 ease-in-out overflow-hidden 
                        ${isReplyFormOpen || numReplies > 0 || isLoadingReplies ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'}
                    `}
                    >
                        <div className="border-t border-gray-100 dark:border-gray-700 pt-2 px-3 pb-2">
                            {isReplyFormOpen && (
                                <div className="mb-3">
                                    <ReplyToComment
                                        stationEvent={stationEvent}
                                        parentComment={comment}
                                        onCommentPosted={handleReplyPosted}
                                        onClose={() => setIsReplyFormOpen(false)}
                                    />
                                </div>
                            )}

                            {isLoadingReplies && (
                                <div className="flex items-center justify-center py-3">
                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                    <span className="ml-2 text-xs text-muted-foreground">Loading replies...</span>
                                </div>
                            )}

                            {!isLoadingReplies && repliesData && repliesData.length > 0 && (
                                <div className="space-y-2 mt-1 pl-4 border-l border-dashed border-muted/30">
                                    {repliesData.map((reply: NDKEvent) => (
                                        <CommentItem
                                            key={reply.id}
                                            comment={reply}
                                            stationEvent={stationEvent}
                                            stationId={stationId}
                                            initialExpandDepth={initialExpandDepth - 1}
                                        />
                                    ))}
                                </div>
                            )}
                            {!isLoadingReplies && (!repliesData || repliesData.length === 0) && (
                                <div className="py-2 text-center text-xs text-muted-foreground">No replies yet.</div>
                            )}
                        </div>
                    </div>
                )}
            </Card>
        </div>
    )
}
