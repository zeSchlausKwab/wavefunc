import { NDKEvent, NDKKind } from '@nostr-dev-kit/ndk'
import { useQuery } from '@tanstack/react-query'
import { ndkActions } from '@wavefunc/common'
import { Badge } from '@wavefunc/ui/components/ui/badge'
import { Button } from '@wavefunc/ui/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@wavefunc/ui/components/ui/tabs'
import { Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import CommentItem from './CommentItem'
import type { CategoryOption } from './ShoutboxComment'
import ShoutboxComment from './ShoutboxComment'

// Define the shoutbox categories
type ShoutboxCategory = 'all' | 'bug' | 'suggestion' | 'greeting' | 'general'
const MAX_REPLY_FETCH_DEPTH = 5 // Max depth for fetching nested replies
const REPLIES_FETCH_LIMIT_PER_DEPTH = 50 // Max replies to fetch per parent set per depth

// Extended CommentItem props to accept specialized getReplies function
interface ExtendedCommentItemProps {
    comment: NDKEvent
    stationEvent: NDKEvent // The virtual shoutbox event
    stationId: string      // ID of the virtual shoutbox event
    // naddr is no longer needed by CommentItem
    // allComments is no longer needed as CommentItem fetches its own replies
    // onReplyPosted is handled by CommentItem internally for its replies
    // getShoutboxReplies is no longer needed
    initialExpandDepth: number // To control default expansion
}

export default function Shoutbox() {
    const [activeTab, setActiveTab] = useState<ShoutboxCategory>('all')
    const [shoutboxEvents, setShoutboxEvents] = useState<NDKEvent[]>([])
    const [rootEvents, setRootEvents] = useState<NDKEvent[]>([])
    const [filteredEvents, setFilteredEvents] = useState<NDKEvent[]>([])
    const [shoutboxEvent, setShoutboxEvent] = useState<NDKEvent | null>(null)
    const [categoryCount, setCategoryCount] = useState<Record<ShoutboxCategory, number>>({
        all: 0,
        bug: 0,
        suggestion: 0,
        greeting: 0,
        general: 0,
    })

    useEffect(() => {
        const ndk = ndkActions.getNDK()
        if (!ndk) return
        const virtualEvent = new NDKEvent(ndk)
        virtualEvent.kind = NDKKind.Text
        virtualEvent.tags = [
            ['t', 'wavefunc'],
            ['t', 'shoutbox'],
        ]
        virtualEvent.content = 'Wavefunc Shoutbox Container'
        virtualEvent.created_at = Math.floor(Date.now() / 1000)
        setShoutboxEvent(virtualEvent)
    }, [])

    const {
        isLoading,
        error,
        data: fetchedData,
        refetch,
    } = useQuery({
        queryKey: ['shoutbox-messages'],
        queryFn: async () => {
            const ndk = ndkActions.getNDK()
            if (!ndk) throw new Error('NDK not available')

            // Step 1: Fetch Kind 1 root posts
            const rootPostsFilter = {
                kinds: [NDKKind.Text],
                '#t': ['wavefunc', 'shoutbox'],
                limit: 50,
            }
            const fetchedRootEvents = await ndk.fetchEvents(rootPostsFilter)
            let rootPosts = Array.from(fetchedRootEvents.values()).filter((event) => {
                if (event.kind !== NDKKind.Text) return false
                const eTags = event.tags.filter((tag) => tag[0].toLowerCase() === 'e')
                const isNip10Reply = eTags.some((tag) => tag.length >= 4 && (tag[3] === 'reply' || tag[3] === 'root'))
                return !isNip10Reply
            })
            rootPosts.sort((a, b) => (b.created_at || 0) - (a.created_at || 0))

            // Step 2: Iteratively fetch Kind 1111 replies
            const allFetchedReplies: NDKEvent[] = []
            let parentEventIdsToFetchRepliesFor = rootPosts.map((event) => event.id)
            const fetchedReplyIds = new Set<string>() // To avoid re-fetching or processing same reply

            for (let depth = 0; depth < MAX_REPLY_FETCH_DEPTH; depth++) {
                if (parentEventIdsToFetchRepliesFor.length === 0) {
                    console.log(`No more parent IDs to fetch replies for at depth ${depth}. Breaking.`)
                    break
                }

                const repliesFilter = {
                    kinds: [1111],
                    '#e': parentEventIdsToFetchRepliesFor,
                    limit: parentEventIdsToFetchRepliesFor.length * REPLIES_FETCH_LIMIT_PER_DEPTH, // Limit per iteration based on parents
                }
                const newRepliesCollection = await ndk.fetchEvents(repliesFilter)
                const newRepliesArray = Array.from(newRepliesCollection.values())

                const trulyNewReplies: NDKEvent[] = []
                for (const reply of newRepliesArray) {
                    if (!fetchedReplyIds.has(reply.id)) {
                        trulyNewReplies.push(reply)
                        allFetchedReplies.push(reply)
                        fetchedReplyIds.add(reply.id)
                    }
                }

                if (trulyNewReplies.length === 0) {
                    console.log(`No new unique replies found at depth ${depth}. Breaking.`)
                    break
                }
                parentEventIdsToFetchRepliesFor = trulyNewReplies.map((event) => event.id)
            }
            console.log(`Total fetched replies after all depths: ${allFetchedReplies.length}`)

            return { rootPosts, allReplyEvents: allFetchedReplies }
        },
        staleTime: 1000 * 60,
        refetchInterval: 1000 * 60 * 5, // Longer refetch interval for this complex query
        enabled: !!shoutboxEvent,
    })

    const filterEvents = useCallback((eventsToFilter: NDKEvent[], category: ShoutboxCategory) => {
        if (category === 'all') {
            setFilteredEvents(eventsToFilter)
            return
        }
        const filtered = eventsToFilter.filter((event) => {
            const tags = event.tags || []
            return tags.some((tag) => tag[0] === 't' && tag[1] === category)
        })
        setFilteredEvents(filtered)
    }, []) // Empty dependency array as setFilteredEvents is stable

    // useEffect to process fetchedData and update states (category counts, filteredEvents, etc.)
    useEffect(() => {
        if (fetchedData) {
            const { rootPosts, allReplyEvents } = fetchedData
            const combinedEvents = [...rootPosts, ...allReplyEvents]
            combinedEvents.sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
            setShoutboxEvents(combinedEvents)
            setRootEvents(rootPosts)

            const counts: Record<ShoutboxCategory, number> = {
                all: rootPosts.length,
                bug: 0,
                suggestion: 0,
                greeting: 0,
                general: 0,
            }
            counts.general = 0
            for (const event of rootPosts) {
                const tags = event.tags || []
                let specificCatFound = false
                if (tags.some((tag) => tag[0] === 't' && tag[1] === 'bug')) {
                    counts.bug++
                    specificCatFound = true
                }
                if (tags.some((tag) => tag[0] === 't' && tag[1] === 'suggestion')) {
                    counts.suggestion++
                    specificCatFound = true
                }
                if (tags.some((tag) => tag[0] === 't' && tag[1] === 'greeting')) {
                    counts.greeting++
                    specificCatFound = true
                }
                if (tags.some((tag) => tag[0] === 't' && tag[1] === 'general') || !specificCatFound) {
                    counts.general++
                }
            }
            counts.all = rootPosts.length
            setCategoryCount(counts)
            filterEvents(rootPosts, activeTab) // Now filterEvents is defined
        }
    }, [fetchedData, activeTab, filterEvents])

    const handleTabChange = (category: ShoutboxCategory) => {
        setActiveTab(category)
        filterEvents(rootEvents, category)
    }

    const handleCommentPosted = () => {
        refetch()
    }

    const categoryOptions: CategoryOption[] = [
        { value: 'bug', label: 'Bug Report' },
        { value: 'suggestion', label: 'Suggestion' },
        { value: 'greeting', label: 'Greeting' },
        { value: 'general', label: 'General' },
    ]

    if (!shoutboxEvent || (isLoading && !fetchedData)) {
        return (
            <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
        )
    }

    // Custom render function to pass initialExpandDepth
    const renderCommentItem = (event: NDKEvent) => {
        const props: ExtendedCommentItemProps = {
            comment: event,
            stationEvent: shoutboxEvent!, 
            stationId: shoutboxEvent!.id || '',
            initialExpandDepth: 2, 
        }

        return <CommentItem key={event.id} {...(props as any)} />
    }

    return (
        <div className="space-y-6 bg-card shadow-sm rounded-lg p-6 border">
            <div className="space-y-2">
                <h2 className="text-2xl font-bold tracking-tight">Community Shoutbox</h2>
                <p className="text-muted-foreground">
                    Welcome to the Wavefunc community shoutbox! Share bug reports, suggestions, greetings, or just chat
                    with the community.
                </p>
            </div>

            <ShoutboxComment
                onCommentPosted={handleCommentPosted}
                categories={categoryOptions}
                shoutboxEvent={shoutboxEvent}
            />

            <Tabs
                defaultValue="all"
                value={activeTab}
                onValueChange={(value) => handleTabChange(value as ShoutboxCategory)}
            >
                <TabsList className="grid grid-cols-5 mb-4">
                    <TabsTrigger value="all" className="flex items-center justify-center gap-1.5">
                        All{' '}
                        <Badge variant="secondary" className="ml-1">
                            {categoryCount.all}
                        </Badge>
                    </TabsTrigger>
                    <TabsTrigger value="bug" className="flex items-center justify-center gap-1.5">
                        Bugs{' '}
                        <Badge variant="secondary" className="ml-1">
                            {categoryCount.bug}
                        </Badge>
                    </TabsTrigger>
                    <TabsTrigger value="suggestion" className="flex items-center justify-center gap-1.5">
                        Suggestions{' '}
                        <Badge variant="secondary" className="ml-1">
                            {categoryCount.suggestion}
                        </Badge>
                    </TabsTrigger>
                    <TabsTrigger value="greeting" className="flex items-center justify-center gap-1.5">
                        Greetings{' '}
                        <Badge variant="secondary" className="ml-1">
                            {categoryCount.greeting}
                        </Badge>
                    </TabsTrigger>
                    <TabsTrigger value="general" className="flex items-center justify-center gap-1.5">
                        General{' '}
                        <Badge variant="secondary" className="ml-1">
                            {categoryCount.general}
                        </Badge>
                    </TabsTrigger>
                </TabsList>

                <TabsContent value={activeTab} className="space-y-4">
                    {isLoading && !fetchedData && (
                        <div className="flex justify-center py-6">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                    )}

                    {error && (
                        <div className="flex flex-col items-center gap-2 py-6">
                            <p className="text-sm text-muted-foreground">Failed to load messages: {error.message}</p>
                            <Button variant="outline" size="sm" onClick={() => refetch()}>
                                Retry
                            </Button>
                        </div>
                    )}

                    {!isLoading && !error && filteredEvents.length === 0 && (
                        <div className="text-center py-6">
                            <p className="text-muted-foreground">
                                No messages in {activeTab === 'all' ? 'the shoutbox' : `the ${activeTab} category`} yet.
                                Be the first to post!
                            </p>
                        </div>
                    )}

                    {!error && <div className="space-y-4">{filteredEvents.map(renderCommentItem)}</div>}
                </TabsContent>
            </Tabs>
        </div>
    )
}
