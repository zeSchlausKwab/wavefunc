import { NDKEvent } from '@nostr-dev-kit/ndk'
import { useQuery } from '@tanstack/react-query'
import { getReplies, ndkActions } from '@wavefunc/common'
import { Card, CardContent, CardFooter, CardHeader } from '@wavefunc/ui/components/ui/card'
import { formatDistanceToNow } from 'date-fns'
import { CornerDownRight, MessageSquare } from 'lucide-react'
import { useState } from 'react'
import { SocialInteractionBar } from '../social/SocialInteractionBar'
import { UserProfile } from '../UserProfile'
import ReplyToComment from './ReplyToComment'

interface CommentItemProps {
    comment: NDKEvent
    stationEvent: NDKEvent
    stationId: string
    naddr: string
    onReplyPosted?: () => void
    allComments: NDKEvent[]
}

export default function CommentItem({
    comment,
    stationEvent,
    stationId,
    onReplyPosted,
    allComments,
}: CommentItemProps) {
    const [isReplyOpen, setIsReplyOpen] = useState(false)

    // Get replies for this comment
    const replies = comment?.id ? getReplies(allComments, comment.id) : []

    // Format timestamp
    const avatarText = comment.pubkey ? comment.pubkey.slice(0, 2).toUpperCase() : 'AN'
    let timestamp = ''
    try {
        timestamp = formatDistanceToNow(new Date((comment.created_at || 0) * 1000), { addSuffix: true })
    } catch {
        // Fallback formatting if date-fns fails
        timestamp = new Date((comment.created_at || 0) * 1000).toLocaleString()
    }

    // Handle posting a new comment
    const handleCommentPosted = () => {
        if (onReplyPosted) {
            onReplyPosted()
        }
    }

    return (
        <div className="relative">
            <Card className="bg-card mb-4">
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

                    {replies.length > 0 && (
                        <div className="flex items-center text-xs text-muted-foreground">
                            <MessageSquare className="h-4 w-4 mr-1" />
                            {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
                        </div>
                    )}
                </CardFooter>

                {/* Replies and reply form are now inside the parent card */}
                {(isReplyOpen || replies.length > 0) && (
                    <div className="border-t border-gray-100 dark:border-gray-800 pt-2 px-4 pb-3">
                        {/* Reply form */}
                        <div className={`transition-all duration-200 ${isReplyOpen ? 'block' : 'hidden'} mb-3`}>
                            {isReplyOpen && (
                                <ReplyToComment
                                    stationEvent={stationEvent}
                                    parentComment={comment}
                                    onCommentPosted={() => {
                                        setIsReplyOpen(false)
                                        handleCommentPosted()
                                    }}
                                />
                            )}
                        </div>

                        {/* Replies are contained within the parent card */}
                        {replies.length > 0 && (
                            <div className="space-y-2 mt-1">
                                {replies.map((reply) => (
                                    <CommentItem
                                        key={reply.id}
                                        comment={reply}
                                        stationEvent={stationEvent}
                                        stationId={stationId}
                                        naddr={comment.id || ''}
                                        allComments={allComments}
                                        onReplyPosted={onReplyPosted}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </Card>
        </div>
    )
}
