"use client";

import { useEffect, useState, useRef } from "react";
import { nostrService } from "@/services/ndk";
import {
  NDKEvent,
  NDKFilter,
  NDKKind,
  NDKSubscription,
  NDKSubscriptionCacheUsage,
} from "@nostr-dev-kit/ndk";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RADIO_EVENT_KINDS } from "@wavefunc/common";

type DebugEvent = {
  id: string;
  timestamp: number;
  kind: number;
  content: string;
  pubkey: string;
  tags: string[][];
};

export function RelayDebugger() {
  const [events, setEvents] = useState<DebugEvent[]>([]);
  const subscriptionRef = useRef<NDKSubscription | null>(null);
  const isInitializedRef = useRef(false);

  useEffect(() => {
    const initRelay = async () => {
      // Prevent double initialization
      if (isInitializedRef.current) return;
      isInitializedRef.current = true;

      const filter: NDKFilter = {
        // kinds: [5000, 6000 as NDKKind, 31337 as NDKKind],
        kinds: [
          RADIO_EVENT_KINDS.STREAM as NDKKind,
          RADIO_EVENT_KINDS.FAVORITES as NDKKind,
        ],
      };

      await nostrService.getNDK().connect();

      const sub = nostrService.getNDK().subscribe(filter, {
        cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY,
      });
      subscriptionRef.current = sub;

      sub.on("event", (event: NDKEvent) => {
        setEvents((prev) => {
          // Check if event already exists
          if (prev.some((e) => e.id === event.id)) {
            return prev;
          }

          const newEvent: DebugEvent = {
            id: event.id,
            timestamp: event.created_at || Date.now(),
            kind: event.kind || 0,
            content: event.content,
            pubkey: event.pubkey,
            tags: event.tags as string[][],
          };

          return [newEvent, ...prev];
        });
      });
    };

    initRelay();

    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.stop();
        subscriptionRef.current = null;
      }
      isInitializedRef.current = false;
    };
  }, []);

  const getEventKindLabel = (kind: number): string => {
    const kinds: Record<number, string> = {
      [NDKKind.Metadata]: "Metadata",
      [NDKKind.Text]: "Text Note",
      [NDKKind.Contacts]: "Contacts",
      [NDKKind.DVMReqTextExtraction]: "DVM Request",
      [NDKKind.DVMJobFeedback]: "DVM Response",
      [NDKKind.NostrConnect]: "NostrConnect",
      [31337]: "Radio Stream",
    };
    return kinds[kind] || `Kind ${kind}`;
  };

  const formatContent = (content: string): string => {
    try {
      return JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      return content;
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Relay Events</CardTitle>
        <span className="text-sm text-muted-foreground">
          {events.length} events captured
        </span>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] rounded-md border p-4">
          <div className="space-y-4">
            {events.map((event) => (
              <div
                key={`${event.id}-${event.timestamp}`}
                className="text-xs font-mono space-y-1"
              >
                <div className="flex justify-between text-muted-foreground">
                  <span>
                    {new Date(event.timestamp * 1000).toLocaleString()}
                  </span>
                  <span className="font-semibold">
                    {getEventKindLabel(event.kind)}
                  </span>
                </div>
                <div>
                  <span className="text-blue-500">ID: </span>
                  {event.id}
                </div>
                <div>
                  <span className="text-blue-500">Pubkey: </span>
                  {event.pubkey}
                </div>
                {event.tags.length > 0 && (
                  <div>
                    <span className="text-blue-500">Tags: </span>
                    <pre className="whitespace-pre-wrap">
                      {JSON.stringify(event.tags, null, 2)}
                    </pre>
                  </div>
                )}
                <div>
                  <span className="text-blue-500">Content: </span>
                  <pre className="whitespace-pre-wrap overflow-x-auto">
                    {formatContent(event.content)}
                  </pre>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
