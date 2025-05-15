import { NDKEvent } from '@nostr-dev-kit/ndk'
import type { QueryKey } from '@tanstack/react-query'
import { useQuery } from '@tanstack/react-query'
import { ndkActions } from '@wavefunc/common'
import { Badge } from '@wavefunc/ui/components/ui/badge'
import { Card, CardContent, CardFooter, CardHeader } from '@wavefunc/ui/components/ui/card'
import { formatDistanceToNow } from 'date-fns'
import { CornerDownRight, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
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

    const relevantTags = useMemo(() => {
        return comment.tags.filter((tag) => tag[0] === 't' && tag[1]).map((tag) => ({ key: tag[0], value: tag[1] }))
    }, [comment.tags])

    const tagColorClasses = [
        'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
        'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
        'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
        'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
        'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    ]

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
                    {relevantTags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                            {relevantTags.map((tag, index) => (
                                <Badge
                                    key={`${tag.key}-${tag.value}-${index}`}
                                    variant="outline"
                                    className={`text-xs ${tagColorClasses[index % tagColorClasses.length]}`}
                                >
                                    #{tag.value}
                                </Badge>
                            ))}
                        </div>
                    )}
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
