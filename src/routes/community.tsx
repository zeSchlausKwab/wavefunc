// Applesauce-native community feed.
// kind 1 root notes + kind 1111 replies, both tagged #wavefunc.
// Reactivity goes through useEventModel(TimelineModel, ...) and a separate
// effect keeps a relay subscription open so the store stays populated.

import { createFileRoute } from "@tanstack/react-router";
import type { Filter } from "applesauce-core/helpers/filter";
import { TimelineModel } from "applesauce-core/models";
import { useEventModel } from "applesauce-react/hooks";
import { storeEvents } from "applesauce-relay/operators";
import { formatDistanceToNow } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { getAppDataRelayUrls } from "../config/nostr";
import { useCurrentAccount, useProfile } from "../lib/nostr/auth";
import {
  buildCommunityReplyTemplate,
  buildCommunityRootTemplate,
  buildReactionTemplate,
  COMMUNITY_POST_KIND,
  COMMUNITY_REPLY_KIND,
  COMMUNITY_TOPIC,
  parseCommunityPostEvent,
  type CommunityCategory,
  type ParsedCommunityPost,
} from "../lib/nostr/domain";
import { useWavefuncNostr } from "../lib/nostr/runtime";
import { cn } from "../lib/utils";

export const Route = createFileRoute("/community")({
  component: Community,
});

type ShoutboxCategory = "all" | CommunityCategory;

interface CategoryOption {
  value: CommunityCategory;
  label: string;
  icon: string;
}

const categoryOptions: CategoryOption[] = [
  { value: "bug",      label: "BUG_REPORT",  icon: "bug_report"   },
  { value: "feature",  label: "FEATURE_REQ", icon: "auto_awesome" },
  { value: "greeting", label: "GREETING",    icon: "waving_hand"  },
  { value: "general",  label: "GENERAL",     icon: "forum"        },
];

// ── Community page ────────────────────────────────────────────────────────────

function Community() {
  const currentUser = useCurrentAccount();
  const { eventStore, relayPool, signAndPublish } = useWavefuncNostr();
  const [activeFilter, setActiveFilter] = useState<ShoutboxCategory>("all");
  const [inputText, setInputText] = useState("");
  const [transmitError, setTransmitError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] =
    useState<CommunityCategory>("general");

  // Subscribe to both kind 1 root notes and kind 1111 replies tagged #wavefunc
  const filters: Filter[] = useMemo(
    () => [
      { kinds: [COMMUNITY_POST_KIND], "#t": [COMMUNITY_TOPIC], limit: 100 },
      { kinds: [COMMUNITY_REPLY_KIND], "#t": [COMMUNITY_TOPIC], limit: 500 },
    ],
    [],
  );

  // Active relay subscription so events flow into the store
  const [eose, setEose] = useState(false);
  useEffect(() => {
    setEose(false);
    const subscription = relayPool
      .subscription(getAppDataRelayUrls(), filters)
      .pipe(storeEvents(eventStore))
      .subscribe({
        next: (message) => {
          if (message === "EOSE") setEose(true);
        },
      });
    return () => subscription.unsubscribe();
  }, [eventStore, relayPool, filters]);

  const rawEvents = useEventModel(TimelineModel, [filters]) ?? [];

  const allPosts: ParsedCommunityPost[] = useMemo(
    () => rawEvents.map((event) => parseCommunityPostEvent(event)),
    [rawEvents],
  );

  // Kind 1 root messages, newest first
  const rootMessages = useMemo(
    () =>
      allPosts
        .filter((post) => post.kind === COMMUNITY_POST_KIND)
        .sort((a, b) => (b.created_at || 0) - (a.created_at || 0)),
    [allPosts],
  );

  // Build thread map: parentEventId → replies[]
  const threadMap = useMemo(() => {
    const map = new Map<string, ParsedCommunityPost[]>();
    for (const post of allPosts) {
      if (post.kind !== COMMUNITY_REPLY_KIND) continue;
      if (!post.parentEventId) continue;
      if (!map.has(post.parentEventId)) map.set(post.parentEventId, []);
      map.get(post.parentEventId)!.push(post);
    }
    return map;
  }, [allPosts]);

  // Filter root messages by active category
  const filteredMessages = useMemo(() => {
    if (activeFilter === "all") return rootMessages;
    return rootMessages.filter((post) => {
      if (activeFilter === "general") {
        // "general" = no other category tag set
        return post.categories.length === 0;
      }
      return post.categories.includes(activeFilter);
    });
  }, [rootMessages, activeFilter]);

  // Category counts (derived directly from rootMessages — no setState needed)
  const categoryCount = useMemo(() => {
    const counts: Record<ShoutboxCategory, number> = {
      all: rootMessages.length,
      bug: 0,
      feature: 0,
      greeting: 0,
      general: 0,
    };
    for (const post of rootMessages) {
      if (post.categories.includes("bug")) counts.bug++;
      if (post.categories.includes("feature")) counts.feature++;
      if (post.categories.includes("greeting")) counts.greeting++;
      if (post.categories.length === 0) counts.general++;
    }
    return counts;
  }, [rootMessages]);

  // Publish a kind 1 root note with #wavefunc + optional category tag
  const handleRootComment = async (
    content: string,
    category: CommunityCategory = "general",
  ) => {
    if (!currentUser) {
      alert("Please log in to post");
      return;
    }
    await signAndPublish(buildCommunityRootTemplate({ content, category }));
  };

  // Publish a kind 1111 reply referencing the parent event
  const handleReply = async (content: string, parent: ParsedCommunityPost) => {
    if (!currentUser) {
      alert("Please log in to reply");
      return;
    }
    await signAndPublish(buildCommunityReplyTemplate(parent.event, content));
  };

  const handleSubmit = async () => {
    if (!inputText.trim()) return;
    setTransmitError(null);
    try {
      await handleRootComment(inputText.trim(), selectedCategory);
      setInputText("");
    } catch {
      setTransmitError("TRANSMISSION_FAILED — CHECK_RELAY_CONNECTION");
    }
  };

  const operatorId = currentUser
    ? `OPERATOR@${currentUser.pubkey.slice(0, 8).toUpperCase()}`
    : "GUEST@WAVEFUNC";

  if (!eose && allPosts.length === 0) {
    return (
      <div className="border-4 border-on-background p-8 bg-surface-container-low flex items-center gap-4 shadow-[6px_6px_0px_0px_rgba(29,28,19,1)]">
        <span className="material-symbols-outlined text-3xl animate-spin">sync</span>
        <span className="font-black uppercase tracking-tight">TUNING_FREQUENCY...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Page header */}
      <div className="border-4 border-on-background bg-surface-container-high p-5 sm:p-6 shadow-[8px_8px_0px_0px_rgba(29,28,19,1)] flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl sm:text-6xl font-black tracking-tighter uppercase leading-none font-headline">
            SIGNAL_FEED
          </h1>
          <p className="font-bold text-primary text-sm mt-1 uppercase tracking-widest">
            COMMUNITY_BROADCAST_CHANNEL
          </p>
          <button
            onClick={() => {
              const el = document.getElementById("transmit-input");
              el?.scrollIntoView({ behavior: "smooth", block: "center" });
              el?.focus();
            }}
            className="mt-3 bg-primary text-white px-4 py-2 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-[3px_3px_0px_0px_rgba(29,28,19,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all"
          >
            <span className="material-symbols-outlined text-[14px]">edit</span>
            NEW_TRANSMISSION
          </button>
        </div>
        <div className="flex gap-3 shrink-0">
          <div className="border-2 border-on-background bg-surface-container-low p-3 flex flex-col items-end min-w-[100px]">
            <span className="text-[9px] font-bold opacity-50 uppercase">TRANSMISSIONS</span>
            <span className="text-2xl font-black">{categoryCount.all}</span>
          </div>
          <div className="border-2 border-on-background bg-secondary-fixed-dim p-3 flex flex-col items-end min-w-[100px] shadow-[4px_4px_0px_0px_rgba(29,28,19,1)]">
            <span className="text-[9px] font-bold opacity-70 uppercase">SHOWING</span>
            <span className="text-2xl font-black">{filteredMessages.length}</span>
          </div>
        </div>
      </div>

      {/* Content: feed + sidebar */}
      <div className="flex items-start">

        {/* Feed column */}
        <div className="flex-1 flex flex-col border-4 border-on-background min-w-0">

          {/* Mobile category filter */}
          <div className="lg:hidden flex gap-1 p-3 border-b-4 border-on-background overflow-x-auto scrollbar-none bg-surface-container-low">
            <button
              onClick={() => setActiveFilter("all")}
              className={cn(
                "px-3 py-1.5 text-[9px] font-black uppercase tracking-widest shrink-0 border-2 transition-colors",
                activeFilter === "all"
                  ? "bg-on-background text-surface border-on-background"
                  : "border-on-background/40 hover:border-on-background"
              )}
            >
              ALL · {categoryCount.all}
            </button>
            {categoryOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setActiveFilter(opt.value)}
                className={cn(
                  "px-3 py-1.5 text-[9px] font-black uppercase tracking-widest shrink-0 border-2 transition-colors",
                  activeFilter === opt.value
                    ? "bg-on-background text-surface border-on-background"
                    : "border-on-background/40 hover:border-on-background"
                )}
              >
                {opt.label} · {categoryCount[opt.value]}
              </button>
            ))}
          </div>

          {/* Terminal input */}
          <form
            onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
            className="border-b-4 border-on-background p-4 bg-surface-container-high"
          >
            {/* Category tag selector */}
            <div className="flex gap-1 mb-3 overflow-x-auto scrollbar-none">
              <span className="text-[9px] font-bold uppercase tracking-widest text-on-background/40 self-center mr-1 shrink-0">
                TAG:
              </span>
              {categoryOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSelectedCategory(opt.value)}
                  className={cn(
                    "px-2.5 py-1 text-[9px] font-black uppercase tracking-widest shrink-0 border-2 transition-colors",
                    selectedCategory === opt.value
                      ? "bg-on-background text-surface border-on-background"
                      : "border-on-background/30 hover:border-on-background"
                  )}
                >
                  {opt.value}
                </button>
              ))}
            </div>
            {/* Input row */}
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none z-10">
                  <span className="text-primary font-black">&gt;</span>
                  <span className="text-[10px] font-bold opacity-40 uppercase tracking-tight whitespace-nowrap hidden sm:block">
                    {operatorId}:
                  </span>
                </div>
                <input
                  id="transmit-input"
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
                  }}
                  placeholder={currentUser ? "TYPE_MESSAGE_HERE..." : "CONNECT_TO_TRANSMIT..."}
                  disabled={!currentUser}
                  className="w-full bg-surface-container-low border-2 border-on-background pl-7 sm:pl-[220px] pr-4 py-3.5 font-mono font-bold text-sm focus:ring-2 focus:ring-primary outline-none placeholder:opacity-20 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
              <button
                type="submit"
                disabled={!currentUser || !inputText.trim()}
                className="bg-primary text-white px-5 sm:px-8 font-black tracking-widest uppercase text-xs sm:text-sm border-2 border-on-background shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none hover:bg-on-background transition-all disabled:opacity-40 disabled:pointer-events-none shrink-0"
              >
                TRANSMIT
              </button>
            </div>
            {transmitError && (
              <div className="mt-2 flex items-center gap-2 text-red-500">
                <span className="material-symbols-outlined text-[14px]">error</span>
                <span className="text-[10px] font-black uppercase tracking-widest">{transmitError}</span>
              </div>
            )}
          </form>

          {/* Message feed */}
          {filteredMessages.length === 0 ? (
            <div className="p-12 text-center">
              <span className="material-symbols-outlined text-5xl text-on-background/20 block mb-4">
                sensors_off
              </span>
              <div className="font-black uppercase tracking-tight text-on-background/40">
                NO_TRANSMISSIONS_YET
              </div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-on-background/30 mt-1">
                BE_THE_FIRST_TO_BROADCAST
              </div>
            </div>
          ) : (
            <div className="divide-y-2 divide-on-background/15">
              {filteredMessages.map((message) => (
                <CommunityMessageCard
                  key={message.id}
                  message={message}
                  replies={threadMap.get(message.id) ?? []}
                  threadMap={threadMap}
                  onReply={handleReply}
                  canReply={!!currentUser}
                />
              ))}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside className="hidden lg:flex w-72 shrink-0 flex-col border-4 border-l-0 border-on-background self-stretch bg-surface-container-low">

          {/* Stats */}
          <div className="border-b-4 border-on-background p-4">
            <div className="text-[9px] font-black uppercase tracking-widest mb-3 flex items-center gap-2">
              <span className="w-2 h-2 bg-primary inline-block" />
              SIGNAL_STATS
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="border-2 border-on-background p-2 text-center bg-surface">
                <div className="text-[8px] font-bold opacity-50 uppercase">Total</div>
                <div className="text-xl font-black">{categoryCount.all}</div>
              </div>
              <div className="border-2 border-on-background p-2 text-center bg-secondary-fixed-dim">
                <div className="text-[8px] font-bold opacity-70 uppercase">Showing</div>
                <div className="text-xl font-black">{filteredMessages.length}</div>
              </div>
            </div>
          </div>

          {/* Category filter */}
          <div className="p-4 space-y-1.5">
            <div className="text-[9px] font-black uppercase tracking-widest mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">tune</span>
              FILTER_CHANNEL
            </div>

            <button
              onClick={() => setActiveFilter("all")}
              className={cn(
                "w-full flex items-center justify-between border-2 p-3 transition-colors",
                activeFilter === "all"
                  ? "bg-on-background text-surface border-on-background"
                  : "border-on-background/30 hover:border-on-background bg-surface"
              )}
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">layers</span>
                <span className="text-[10px] font-black uppercase">ALL</span>
              </div>
              <span className="text-[10px] font-black">{categoryCount.all}</span>
            </button>

            {categoryOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setActiveFilter(opt.value)}
                className={cn(
                  "w-full flex items-center justify-between border-2 p-3 transition-colors",
                  activeFilter === opt.value
                    ? "bg-on-background text-surface border-on-background"
                    : "border-on-background/30 hover:border-on-background bg-surface"
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px]">{opt.icon}</span>
                  <span className="text-[10px] font-black uppercase">{opt.label}</span>
                </div>
                <span className="text-[10px] font-black">{categoryCount[opt.value]}</span>
              </button>
            ))}
          </div>
        </aside>

      </div>
    </div>
  );
}

// ── Reactions hook ────────────────────────────────────────────────────────────

function useEventReactions(eventId: string) {
  const currentUser = useCurrentAccount();
  const { eventStore, relayPool } = useWavefuncNostr();

  const filters: Filter[] = useMemo(
    () => [{ kinds: [7], "#e": [eventId] }],
    [eventId],
  );

  useEffect(() => {
    const subscription = relayPool
      .subscription(getAppDataRelayUrls(), filters)
      .pipe(storeEvents(eventStore))
      .subscribe();
    return () => subscription.unsubscribe();
  }, [eventStore, relayPool, filters]);

  const reactionEvents = useEventModel(TimelineModel, [filters]) ?? [];

  return useMemo(() => {
    return {
      count: reactionEvents.length,
      userHasReacted: reactionEvents.some(
        (e) => e.pubkey === currentUser?.pubkey,
      ),
    };
  }, [reactionEvents, currentUser?.pubkey]);
}

// ── Root message card ─────────────────────────────────────────────────────────

interface CommunityMessageCardProps {
  message: ParsedCommunityPost;
  replies: ParsedCommunityPost[];
  threadMap: Map<string, ParsedCommunityPost[]>;
  onReply: (content: string, parent: ParsedCommunityPost) => Promise<void>;
  canReply: boolean;
}

function CommunityMessageCard({
  message,
  replies,
  threadMap,
  onReply,
  canReply,
}: CommunityMessageCardProps) {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replyError, setReplyError] = useState<string | null>(null);
  const profile = useProfile(message.pubkey);
  const currentUser = useCurrentAccount();
  const { signAndPublish } = useWavefuncNostr();

  const { count: reactionCount, userHasReacted } = useEventReactions(message.id);

  const timestamp = message.created_at
    ? formatDistanceToNow(new Date(message.created_at * 1000), { addSuffix: true })
    : "UNKNOWN_TIME";

  const opId = `OP_${message.pubkey.slice(0, 8).toUpperCase()}`;

  const sortedReplies = useMemo(
    () => [...replies].sort((a, b) => (a.created_at || 0) - (b.created_at || 0)),
    [replies],
  );

  const handleReact = async () => {
    if (!currentUser) return;
    await signAndPublish(buildReactionTemplate(message.event));
  };

  const handleShare = () => {
    navigator.clipboard?.writeText(`${window.location.origin}/community#${message.id}`);
  };

  const handleReplySubmit = async () => {
    if (!replyText.trim()) return;
    setReplyError(null);
    try {
      await onReply(replyText.trim(), message);
      setReplyText("");
      setShowReplyForm(false);
      setShowReplies(true); // Expand replies after posting so user sees it
    } catch {
      setReplyError("TRANSMISSION_FAILED — CHECK_RELAY_CONNECTION");
    }
  };

  return (
    <div className="p-4 group">
      <div className="flex items-start gap-3">

        {/* Square avatar */}
        <div className="w-11 h-11 border-2 border-on-background bg-surface-container-highest shrink-0 overflow-hidden">
          {profile?.picture ? (
            <img
              src={profile.picture}
              alt={opId}
              className="w-full h-full object-cover grayscale contrast-125"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-on-background">
              <span className="text-surface text-xs font-black">
                {message.pubkey.slice(0, 2).toUpperCase()}
              </span>
            </div>
          )}
        </div>

        {/* Message card */}
        <div className="flex-1 border-2 border-on-background bg-background p-4 shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] group-hover:-translate-y-0.5 transition-transform min-w-0">

          {/* Header */}
          <div className="flex justify-between items-center mb-2 border-b-2 border-outline/50 pb-1.5 flex-wrap gap-1">
            <span className="text-[10px] font-bold tracking-widest text-primary uppercase">
              {opId}
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              {message.categories.map((cat) => (
                <span
                  key={cat}
                  className="text-[8px] font-black uppercase bg-on-background text-surface px-1.5 py-0.5"
                >
                  {cat}
                </span>
              ))}
              <span className="text-[10px] font-bold opacity-50 uppercase">
                {timestamp.toUpperCase().replace(/ /g, "_")}
              </span>
            </div>
          </div>

          {/* Content */}
          <p className="text-sm font-medium tracking-tight break-words">
            {message.content}
          </p>

          {/* Social action bar */}
          <div className="mt-3 pt-2 border-t-2 border-outline/30 flex items-center justify-between">
            <div className="flex gap-4">
              <button
                onClick={handleReact}
                disabled={!canReply}
                className={cn(
                  "flex items-center gap-1 transition-colors",
                  canReply ? "hover:text-primary" : "opacity-30 cursor-not-allowed",
                  userHasReacted && "text-primary"
                )}
              >
                <span
                  className="material-symbols-outlined text-sm"
                  style={{ fontVariationSettings: userHasReacted ? "'FILL' 1" : "'FILL' 0" }}
                >
                  favorite
                </span>
                {reactionCount > 0 && (
                  <span className="text-[10px] font-black">{reactionCount}</span>
                )}
              </button>

              <button
                disabled={!canReply}
                className={cn(
                  "flex items-center gap-1 transition-colors hover:text-yellow-500",
                  !canReply && "opacity-30 cursor-not-allowed"
                )}
              >
                <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
                  bolt
                </span>
              </button>

              <button
                onClick={handleShare}
                className="flex items-center gap-1 hover:text-primary transition-colors"
              >
                <span className="material-symbols-outlined text-sm">share</span>
              </button>
            </div>

            <div className="flex items-center gap-3">
              {replies.length > 0 && (
                <button
                  onClick={() => setShowReplies((v) => !v)}
                  className="flex items-center gap-1 text-[10px] font-black uppercase hover:text-primary transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">forum</span>
                  {showReplies ? "HIDE" : `${replies.length} REPL${replies.length === 1 ? "Y" : "IES"}`}
                </button>
              )}
              <button
                onClick={() => {
                  setShowReplyForm((v) => !v);
                  if (!showReplyForm) setShowReplies(true);
                }}
                disabled={!canReply}
                className={cn(
                  "flex items-center gap-1 transition-colors text-[10px] font-black uppercase",
                  canReply ? "hover:text-primary" : "opacity-30 cursor-not-allowed",
                  showReplyForm && "text-primary"
                )}
              >
                <span className="material-symbols-outlined text-sm">sensors</span>
                {showReplyForm ? "CANCEL" : "PULSE"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Thread */}
      {(showReplies && sortedReplies.length > 0) || showReplyForm ? (
        <div className="mt-3 ml-[56px] space-y-2 border-l-4 border-on-background/20 pl-4">
          {showReplies && sortedReplies.map((reply) => (
            <ReplyCard
              key={reply.id}
              reply={reply}
              directReplies={threadMap.get(reply.id) ?? []}
              threadMap={threadMap}
              onReply={onReply}
              canReply={canReply}
              defaultShowReplies={true}
            />
          ))}

          {showReplyForm && (
            <div>
              <form
                onSubmit={(e) => { e.preventDefault(); handleReplySubmit(); }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="REPLY_TRANSMISSION..."
                  autoFocus
                  className="flex-1 bg-surface-container-low border-2 border-on-background px-3 py-2 font-mono font-bold text-xs focus:ring-2 focus:ring-primary outline-none placeholder:opacity-30 min-w-0"
                />
                <button
                  type="submit"
                  disabled={!replyText.trim()}
                  className="bg-primary text-white px-4 font-black uppercase tracking-widest text-xs border-2 border-on-background hover:bg-on-background transition-colors disabled:opacity-40 disabled:pointer-events-none shrink-0"
                >
                  SEND
                </button>
              </form>
              {replyError && (
                <div className="mt-1.5 flex items-center gap-1.5 text-red-500">
                  <span className="material-symbols-outlined text-[12px]">error</span>
                  <span className="text-[9px] font-black uppercase tracking-widest">{replyError}</span>
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ── Reply card — recursive, identical style to root message card ──────────────

interface ReplyCardProps {
  reply: ParsedCommunityPost;
  directReplies: ParsedCommunityPost[];
  threadMap: Map<string, ParsedCommunityPost[]>;
  onReply: (content: string, parent: ParsedCommunityPost) => Promise<void>;
  canReply: boolean;
  defaultShowReplies?: boolean;
}

function ReplyCard({
  reply,
  directReplies,
  threadMap,
  onReply,
  canReply,
  defaultShowReplies,
}: ReplyCardProps) {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [showReplies, setShowReplies] = useState(defaultShowReplies ?? false);
  const [replyText, setReplyText] = useState("");
  const [replyError, setReplyError] = useState<string | null>(null);
  const profile = useProfile(reply.pubkey);
  const currentUser = useCurrentAccount();
  const { signAndPublish } = useWavefuncNostr();

  const { count: reactionCount, userHasReacted } = useEventReactions(reply.id);

  const opId = `OP_${reply.pubkey.slice(0, 8).toUpperCase()}`;
  const timestamp = reply.created_at
    ? formatDistanceToNow(new Date(reply.created_at * 1000), { addSuffix: true })
    : "UNKNOWN_TIME";

  const sortedReplies = useMemo(
    () => [...directReplies].sort((a, b) => (a.created_at || 0) - (b.created_at || 0)),
    [directReplies],
  );

  const handleReact = async () => {
    if (!currentUser) return;
    await signAndPublish(buildReactionTemplate(reply.event));
  };

  const handleShare = () => {
    navigator.clipboard?.writeText(`${window.location.origin}/community#${reply.id}`);
  };

  const handleReplySubmit = async () => {
    if (!replyText.trim()) return;
    setReplyError(null);
    try {
      await onReply(replyText.trim(), reply);
      setReplyText("");
      setShowReplyForm(false);
      setShowReplies(true);
    } catch {
      setReplyError("TRANSMISSION_FAILED — CHECK_RELAY_CONNECTION");
    }
  };

  return (
    <div>
      <div className="flex items-start gap-3 group">

        {/* Square avatar */}
        <div className="w-11 h-11 border-2 border-on-background bg-surface-container-highest shrink-0 overflow-hidden">
          {profile?.picture ? (
            <img
              src={profile.picture}
              alt={opId}
              className="w-full h-full object-cover grayscale contrast-125"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-on-background">
              <span className="text-surface text-xs font-black">
                {reply.pubkey.slice(0, 2).toUpperCase()}
              </span>
            </div>
          )}
        </div>

        {/* Card */}
        <div className="flex-1 border-2 border-on-background bg-background p-4 shadow-[4px_4px_0px_0px_rgba(29,28,19,1)] group-hover:-translate-y-0.5 transition-transform min-w-0">

          <div className="flex justify-between items-center mb-2 border-b-2 border-outline/50 pb-1.5 flex-wrap gap-1">
            <span className="text-[10px] font-bold tracking-widest text-primary uppercase">{opId}</span>
            <span className="text-[10px] font-bold opacity-50 uppercase">
              {timestamp.toUpperCase().replace(/ /g, "_")}
            </span>
          </div>

          <p className="text-sm font-medium tracking-tight break-words">{reply.content}</p>

          <div className="mt-3 pt-2 border-t-2 border-outline/30 flex items-center justify-between">
            <div className="flex gap-4">
              <button
                onClick={handleReact}
                disabled={!canReply}
                className={cn(
                  "flex items-center gap-1 transition-colors",
                  canReply ? "hover:text-primary" : "opacity-30 cursor-not-allowed",
                  userHasReacted && "text-primary"
                )}
              >
                <span
                  className="material-symbols-outlined text-sm"
                  style={{ fontVariationSettings: userHasReacted ? "'FILL' 1" : "'FILL' 0" }}
                >
                  favorite
                </span>
                {reactionCount > 0 && <span className="text-[10px] font-black">{reactionCount}</span>}
              </button>

              <button
                disabled={!canReply}
                className={cn(
                  "flex items-center gap-1 transition-colors hover:text-yellow-500",
                  !canReply && "opacity-30 cursor-not-allowed"
                )}
              >
                <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
                  bolt
                </span>
              </button>

              <button onClick={handleShare} className="flex items-center gap-1 hover:text-primary transition-colors">
                <span className="material-symbols-outlined text-sm">share</span>
              </button>
            </div>

            <div className="flex items-center gap-3">
              {directReplies.length > 0 && (
                <button
                  onClick={() => setShowReplies((v) => !v)}
                  className="flex items-center gap-1 text-[10px] font-black uppercase hover:text-primary transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">forum</span>
                  {showReplies ? "HIDE" : `${directReplies.length} REPL${directReplies.length === 1 ? "Y" : "IES"}`}
                </button>
              )}
              <button
                onClick={() => {
                  setShowReplyForm((v) => !v);
                  if (!showReplyForm) setShowReplies(true);
                }}
                disabled={!canReply}
                className={cn(
                  "flex items-center gap-1 transition-colors text-[10px] font-black uppercase",
                  canReply ? "hover:text-primary" : "opacity-30 cursor-not-allowed",
                  showReplyForm && "text-primary"
                )}
              >
                <span className="material-symbols-outlined text-sm">sensors</span>
                {showReplyForm ? "CANCEL" : "PULSE"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Nested thread */}
      {(showReplies && sortedReplies.length > 0) || showReplyForm ? (
        <div className="mt-2 ml-[56px] space-y-2 border-l-4 border-on-background/15 pl-4">
          {showReplies && sortedReplies.map((child) => (
            <ReplyCard
              key={child.id}
              reply={child}
              directReplies={threadMap.get(child.id) ?? []}
              threadMap={threadMap}
              onReply={onReply}
              canReply={canReply}
              defaultShowReplies={defaultShowReplies}
            />
          ))}
          {showReplyForm && (
            <div>
              <form
                onSubmit={(e) => { e.preventDefault(); handleReplySubmit(); }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="REPLY_TRANSMISSION..."
                  autoFocus
                  className="flex-1 bg-surface-container-low border-2 border-on-background px-3 py-2 font-mono font-bold text-xs focus:ring-2 focus:ring-primary outline-none placeholder:opacity-30 min-w-0"
                />
                <button
                  type="submit"
                  disabled={!replyText.trim()}
                  className="bg-primary text-white px-4 font-black uppercase tracking-widest text-xs border-2 border-on-background hover:bg-on-background transition-colors disabled:opacity-40 disabled:pointer-events-none shrink-0"
                >
                  SEND
                </button>
              </form>
              {replyError && (
                <div className="mt-1.5 flex items-center gap-1.5 text-red-500">
                  <span className="material-symbols-outlined text-[12px]">error</span>
                  <span className="text-[9px] font-black uppercase tracking-widest">{replyError}</span>
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
