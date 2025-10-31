import { CommentForm } from "@/components/CommentForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserAvatar } from "@/components/UserAvatar";
import {
  NDKEvent,
  NDKKind,
  useNDK,
  useNDKCurrentUser,
  useSubscribe,
} from "@nostr-dev-kit/react";
import { createFileRoute } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import {
  Loader2,
  MessageCircle,
  Bug,
  Sparkles,
  Hand,
  MessagesSquare,
  Layers,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export const Route = createFileRoute("/community")({
  component: Community,
});

// Define the shoutbox categories
type ShoutboxCategory = "all" | "bug" | "feature" | "greeting" | "general";

interface CategoryOption {
  value: ShoutboxCategory;
  label: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
}

const categoryOptions: CategoryOption[] = [
  {
    value: "bug",
    label: "Bug Report",
    description: "Report issues and bugs",
    icon: Bug,
  },
  {
    value: "feature",
    label: "Feature Request",
    description: "Suggest new features",
    icon: Sparkles,
  },
  {
    value: "greeting",
    label: "Greeting",
    description: "Say hello to the community",
    icon: Hand,
  },
  {
    value: "general",
    label: "General",
    description: "General discussion",
    icon: MessagesSquare,
  },
];

function Community() {
  const { ndk } = useNDK();
  const currentUser = useNDKCurrentUser();
  const [activeTab, setActiveTab] = useState<ShoutboxCategory>("all");
  const [shoutboxEvent, setShoutboxEvent] = useState<NDKEvent | null>(null);
  const [categoryCount, setCategoryCount] = useState<
    Record<ShoutboxCategory, number>
  >({
    all: 0,
    bug: 0,
    feature: 0,
    greeting: 0,
    general: 0,
  });

  // Create virtual shoutbox event for NIP-22 comments
  useEffect(() => {
    if (!ndk) return;

    const virtualEvent = new NDKEvent(ndk);
    virtualEvent.kind = NDKKind.Text;
    virtualEvent.tags = [
      ["t", "wavefunc"],
      ["t", "shoutbox"],
    ];
    virtualEvent.content = "Wavefunc Community Shoutbox";
    virtualEvent.created_at = Math.floor(Date.now() / 1000);
    virtualEvent.id = "wavefunc-community-shoutbox"; // Fixed ID for consistency
    setShoutboxEvent(virtualEvent);
  }, [ndk]);

  // Subscribe to NIP-22 comments with #wavefunc tag
  const filters = useMemo(() => {
    if (!shoutboxEvent) return false; // Disable subscription when shoutboxEvent is not ready

    return [
      {
        kinds: [1111], // NIP-22 comments
        "#t": ["wavefunc"], // Must have #wavefunc tag
        limit: 100,
      },
    ];
  }, [shoutboxEvent]);

  const { events: allComments, eose } = useSubscribe(
    filters,
    { closeOnEose: false, groupable: false },
    [shoutboxEvent?.id]
  );

  // Filter root comments (those that don't reply to other comments)
  const rootComments = useMemo(() => {
    return allComments.filter((event) => {
      // Root comments should not have 'e' tags pointing to other comments
      const eTags = event.tags.filter((tag) => tag[0] === "e");
      return eTags.length === 0;
    });
  }, [allComments]);

  // Filter comments by category
  const filteredComments = useMemo(() => {
    if (activeTab === "all") {
      return rootComments;
    }

    return rootComments.filter((event) => {
      const tags = event.tags || [];
      return tags.some((tag) => tag[0] === "t" && tag[1] === activeTab);
    });
  }, [rootComments, activeTab]);

  // Calculate category counts
  useEffect(() => {
    const counts: Record<ShoutboxCategory, number> = {
      all: rootComments.length,
      bug: 0,
      feature: 0,
      greeting: 0,
      general: 0,
    };

    rootComments.forEach((event) => {
      const tags = event.tags || [];
      let specificCatFound = false;

      if (tags.some((tag) => tag[0] === "t" && tag[1] === "bug")) {
        counts.bug++;
        specificCatFound = true;
      }
      if (tags.some((tag) => tag[0] === "t" && tag[1] === "feature")) {
        counts.feature++;
        specificCatFound = true;
      }
      if (tags.some((tag) => tag[0] === "t" && tag[1] === "greeting")) {
        counts.greeting++;
        specificCatFound = true;
      }
      if (
        tags.some((tag) => tag[0] === "t" && tag[1] === "general") ||
        !specificCatFound
      ) {
        counts.general++;
      }
    });

    setCategoryCount(counts);
  }, [rootComments]);

  const handleRootComment = async (
    content: string,
    category: ShoutboxCategory = "general"
  ) => {
    if (!currentUser || !ndk) {
      alert("Please log in to post to the community");
      return;
    }

    try {
      const comment = new NDKEvent(ndk);
      comment.kind = 1111; // NIP-22 comment
      comment.content = content;
      comment.tags = [
        ["t", "wavefunc"], // Required tag
      ];

      // Add category tag if not general
      if (category !== "general") {
        comment.tags.push(["t", category]);
      }

      await comment.publish();
      console.log("Posted community comment with category:", category);
    } catch (error) {
      console.error("Error posting community comment:", error);
      throw error;
    }
  };

  const handleReply = async (content: string, parentEvent: NDKEvent) => {
    if (!currentUser || !ndk) {
      alert("Please log in to reply");
      return;
    }

    try {
      const reply = new NDKEvent(ndk);
      reply.kind = 1111; // NIP-22 comment
      reply.content = content;
      reply.tags = [
        ["t", "wavefunc"], // Required tag
        ["e", parentEvent.id, "", "reply"], // Reply to parent
        ["p", parentEvent.pubkey], // Mention parent author
      ];

      await reply.publish();
      console.log("Posted reply to community comment:", parentEvent.id);
    } catch (error) {
      console.error("Error posting reply:", error);
      throw error;
    }
  };

  if (!eose && allComments.length === 0) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <MessageCircle className="h-8 w-8 text-green-500" />
          Community
        </h1>
        <p className="text-gray-600">
          Share feedback, report bugs, request features, or just say hello to
          the Wavefunc community!
        </p>
      </div>

      {/* Category Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as ShoutboxCategory)}
      >
        <div className="w-full overflow-x-auto">
          <TabsList className="w-full justify-start min-w-max inline-flex">
            <TabsTrigger value="all" className="flex items-center gap-2">
              <Layers className="w-4 h-4" />
              <span className="hidden sm:inline">All</span>
              <Badge variant="secondary" className="text-xs">
                {categoryCount.all}
              </Badge>
            </TabsTrigger>
            {categoryOptions.map((option) => {
              const Icon = option.icon;
              return (
                <TabsTrigger
                  key={option.value}
                  value={option.value}
                  className="flex items-center gap-2"
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{option.label}</span>
                  <Badge variant="secondary" className="text-xs">
                    {categoryCount[option.value]}
                  </Badge>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {/* Tab Contents */}
        <TabsContent value="all" className="space-y-6">
          <CommunityContent
            comments={filteredComments}
            onRootComment={handleRootComment}
            onReply={handleReply}
            category="general"
          />
        </TabsContent>

        {categoryOptions.map((option) => (
          <TabsContent
            key={option.value}
            value={option.value}
            className="space-y-6"
          >
            <div className="bg-gray-50 p-4 rounded-lg border">
              <h3 className="font-semibold text-lg">{option.label}</h3>
              <p className="text-gray-600 text-sm">{option.description}</p>
            </div>
            <CommunityContent
              comments={filteredComments}
              onRootComment={handleRootComment}
              onReply={handleReply}
              category={option.value}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

interface CommunityContentProps {
  comments: NDKEvent[];
  onRootComment: (content: string, category: ShoutboxCategory) => Promise<void>;
  onReply: (content: string, parentEvent: NDKEvent) => Promise<void>;
  category: ShoutboxCategory;
}

function CommunityContent({
  comments,
  onRootComment,
  onReply,
  category,
}: CommunityContentProps) {
  const currentUser = useNDKCurrentUser();

  return (
    <div className="space-y-6">
      {/* Comment Form */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="font-semibold mb-3">
          {category === "general"
            ? "Share with the community"
            : `Post a ${category}`}
        </h3>
        <CommentForm
          onSubmit={(content) => onRootComment(content, category)}
          placeholder={`What's on your mind? ${
            category !== "general" ? `(${category})` : ""
          }`}
        />
      </div>

      {/* Comments List */}
      <div className="space-y-4">
        {comments.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <MessageCircle className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p className="text-lg font-medium">No posts yet</p>
            <p className="text-sm">
              Be the first to share something with the community!
            </p>
          </div>
        ) : (
          comments
            .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
            .map((comment) => (
              <CommunityCommentCard
                key={comment.id}
                comment={comment}
                onReply={onReply}
              />
            ))
        )}
      </div>
    </div>
  );
}

interface CommunityCommentCardProps {
  comment: NDKEvent;
  onReply: (content: string, parentEvent: NDKEvent) => Promise<void>;
}

function CommunityCommentCard({ comment, onReply }: CommunityCommentCardProps) {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const currentUser = useNDKCurrentUser();

  const timestamp = comment.created_at
    ? formatDistanceToNow(new Date(comment.created_at * 1000), {
        addSuffix: true,
      })
    : "Unknown time";

  const categories = comment.tags
    .filter((tag) => tag[0] === "t" && tag[1] !== "wavefunc")
    .map((tag) => tag[1]);

  const handleReplySubmit = async (content: string) => {
    await onReply(content, comment);
    setShowReplyForm(false);
  };

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <UserAvatar pubkey={comment.pubkey} mode="avatar-name" size="sm" />
          <div className="flex flex-col">
            <span className="text-xs text-gray-500">{timestamp}</span>
            {categories.length > 0 && (
              <div className="flex gap-1 mt-1">
                {categories.map((cat) => (
                  <Badge key={cat} variant="outline" className="text-xs">
                    {cat}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="whitespace-pre-wrap break-words text-gray-900">
        {comment.content}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowReplyForm(!showReplyForm)}
          className="text-gray-500 hover:text-gray-700"
        >
          <MessageCircle className="w-4 h-4 mr-1" />
          Reply
        </Button>
      </div>

      {/* Reply Form */}
      {showReplyForm && (
        <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <CommentForm
            onSubmit={handleReplySubmit}
            onCancel={() => setShowReplyForm(false)}
            placeholder="Write your reply..."
            autoFocus
          />
        </div>
      )}
    </>
  );
}
