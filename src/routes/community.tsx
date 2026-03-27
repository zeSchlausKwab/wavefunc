import {
  NDKEvent,
  NDKKind,
  useNDK,
  useNDKCurrentUser,
  useProfileValue,
  useSubscribe,
} from "@nostr-dev-kit/react";
import { createFileRoute } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { cn } from "../lib/utils";

export const Route = createFileRoute("/community")({
  component: Community,
});

type ShoutboxCategory = "all" | "bug" | "feature" | "greeting" | "general";

interface CategoryOption {
  value: Exclude<ShoutboxCategory, "all">;
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
  const { ndk } = useNDK();
  const currentUser = useNDKCurrentUser();
  const [activeFilter, setActiveFilter] = useState<ShoutboxCategory>("all");
  const [inputText, setInputText] = useState("");
  const [transmitError, setTransmitError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Exclude<ShoutboxCategory, "all">>("general");

  const [categoryCount, setCategoryCount] = useState<Record<ShoutboxCategory, number>>({
    all: 0, bug: 0, feature: 0, greeting: 0, general: 0,
  });

  // Subscribe to both kind 1 root notes and kind 1111 replies tagged #wavefunc
  const filters = useMemo(() => [
    { kinds: [NDKKind.Text],         "#t": ["wavefunc"], limit: 100 },
    { kinds: [NDKKind.GenericReply], "#t": ["wavefunc"], limit: 500 },
  ], []);

  const { events: allEvents, eose } = useSubscribe(
    filters,
    { closeOnEose: false, groupable: false }
  );

  // Kind 1 root messages, newest first
  const rootMessages = useMemo(() =>
    allEvents
      .filter((e) => e.kind === NDKKind.Text)
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0)),
    [allEvents]
  );

  // Build thread map: rootMessageId → replies[]
  const threadMap = useMemo(() => {
    const map = new Map<string, NDKEvent[]>();
    allEvents
      .filter((e) => e.kind === NDKKind.GenericReply)
      .forEach((reply) => {
        const eTag = reply.tags.find((t) => t[0] === "e");
        const parentId = eTag?.[1];
        if (!parentId) return;
        if (!map.has(parentId)) map.set(parentId, []);
        map.get(parentId)!.push(reply);
      });
    return map;
  }, [allEvents]);

  // Filter root messages by active category
  const filteredMessages = useMemo(() => {
    if (activeFilter === "all") return rootMessages;
    return rootMessages.filter((e) =>
      e.tags.some((t) => t[0] === "t" && t[1] === activeFilter)
    );
  }, [rootMessages, activeFilter]);

  // Category counts
  useEffect(() => {
    const counts: Record<ShoutboxCategory, number> = {
      all: rootMessages.length, bug: 0, feature: 0, greeting: 0, general: 0,
    };
    rootMessages.forEach((e) => {
      const tags = e.tags;
      let found = false;
      if (tags.some((t) => t[0] === "t" && t[1] === "bug"))      { counts.bug++;      found = true; }
      if (tags.some((t) => t[0] === "t" && t[1] === "feature"))  { counts.feature++;  found = true; }
      if (tags.some((t) => t[0] === "t" && t[1] === "greeting")) { counts.greeting++; found = true; }
      if (!found) counts.general++;
    });
    setCategoryCount(counts);
  }, [rootMessages]);

  // Publish a kind 1 root note with #wavefunc + optional category tag
  const handleRootComment = async (
    content: string,
    category: Exclude<ShoutboxCategory, "all"> = "general"
  ) => {
    if (!currentUser || !ndk) { alert("Please log in to post"); return; }
    const note = new NDKEvent(ndk);
    note.kind = NDKKind.Text;
    note.content = content;
    note.tags = [["t", "wavefunc"]];
    if (category !== "general") note.tags.push(["t", category]);
    await note.publish();
  };

  // Publish a kind 1111 reply referencing the parent event
  const handleReply = async (content: string, parentEvent: NDKEvent) => {
    if (!currentUser || !ndk) { alert("Please log in to reply"); return; }
    const reply = new NDKEvent(ndk);
    reply.kind = NDKKind.GenericReply;
    reply.content = content;
    reply.tags = [
      ["t", "wavefunc"],
      ["e", parentEvent.id, "", "reply"],
      ["p", parentEvent.pubkey],
    ];
    await reply.publish();
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

  if (!eose && allEvents.length === 0) {
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

// ── Root message card ─────────────────────────────────────────────────────────

interface CommunityMessageCardProps {
  message: NDKEvent;
  replies: NDKEvent[];
  threadMap: Map<string, NDKEvent[]>;
  onReply: (content: string, parentEvent: NDKEvent) => Promise<void>;
  canReply: boolean;
}

function CommunityMessageCard({ message, replies, threadMap, onReply, canReply }: CommunityMessageCardProps) {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replyError, setReplyError] = useState<string | null>(null);
  const profile = useProfileValue(message.pubkey);
  const currentUser = useNDKCurrentUser();

  // Reactions on the root message (kind 1)
  const reactionFilter = useMemo(
    () => [{ kinds: [NDKKind.Reaction], "#e": [message.id] }],
    [message.id]
  );
  const { events: reactionEvents } = useSubscribe(
    reactionFilter,
    { closeOnEose: true },
    [message.id]
  );
  const reactionCount = reactionEvents.length;
  const userHasReacted = reactionEvents.some((e) => e.pubkey === currentUser?.pubkey);

  const timestamp = message.created_at
    ? formatDistanceToNow(new Date(message.created_at * 1000), { addSuffix: true })
    : "UNKNOWN_TIME";

  const categories = message.tags
    .filter((t) => t[0] === "t" && t[1] !== "wavefunc")
    .map((t) => t[1]);

  const opId = `OP_${message.pubkey.slice(0, 8).toUpperCase()}`;

  const sortedReplies = useMemo(
    () => [...replies].sort((a, b) => (a.created_at || 0) - (b.created_at || 0)),
    [replies]
  );

  const handleReact = async () => {
    if (!currentUser) return;
    await message.react("❤️");
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
              {categories.map((cat) => (
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
  reply: NDKEvent;
  directReplies: NDKEvent[];
  threadMap: Map<string, NDKEvent[]>;
  onReply: (content: string, parentEvent: NDKEvent) => Promise<void>;
  canReply: boolean;
  defaultShowReplies?: boolean;
}

function ReplyCard({ reply, directReplies, threadMap, onReply, canReply, defaultShowReplies }: ReplyCardProps) {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [showReplies, setShowReplies] = useState(defaultShowReplies ?? false);
  const [replyText, setReplyText] = useState("");
  const [replyError, setReplyError] = useState<string | null>(null);
  const profile = useProfileValue(reply.pubkey);
  const currentUser = useNDKCurrentUser();

  const reactionFilter = useMemo(
    () => [{ kinds: [NDKKind.Reaction], "#e": [reply.id] }],
    [reply.id]
  );
  const { events: reactionEvents } = useSubscribe(
    reactionFilter,
    { closeOnEose: true },
    [reply.id]
  );
  const reactionCount = reactionEvents.length;
  const userHasReacted = reactionEvents.some((e) => e.pubkey === currentUser?.pubkey);

  const opId = `OP_${reply.pubkey.slice(0, 8).toUpperCase()}`;
  const timestamp = reply.created_at
    ? formatDistanceToNow(new Date(reply.created_at * 1000), { addSuffix: true })
    : "UNKNOWN_TIME";

  const sortedReplies = useMemo(
    () => [...directReplies].sort((a, b) => (a.created_at || 0) - (b.created_at || 0)),
    [directReplies]
  );

  const handleReact = async () => {
    if (!currentUser) return;
    await reply.react("❤️");
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
