import { NDKEvent } from '@nostr-dev-kit/ndk'
import { useComments } from '../../queries'
import { getRootComments } from '@wavefunc/common'
import { Button } from '@wavefunc/ui/components/ui/button'
import { MessageSquare, RefreshCw } from 'lucide-react'
import CommentItem from './CommentItem'
import CreateComment from './CreateComment'

interface CommentsListProps {
    stationEvent: NDKEvent
    stationId: string
}

export default function CommentsList({ stationEvent, stationId }: CommentsListProps) {
    // Use the query hook with event ID (like before refactoring)
    const { data: allComments = [], isLoading, error, isError, refetch } = useComments(stationId)

    // When new comment is posted, refresh the list
    const handleCommentPosted = () => {
        refetch()
    }

    // Convert NostrComment objects to NDKEvents for getRootComments function
    const commentEvents: NDKEvent[] = allComments.map((comment) => comment.event).filter(Boolean) as NDKEvent[]

    const rootComments = commentEvents.length > 0 ? getRootComments(commentEvents) : []

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
                        initialExpandDepth={3}
                    />
                ))}
            </div>
        </div>
    )
}
