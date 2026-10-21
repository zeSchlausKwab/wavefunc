import type { NostrEvent } from "applesauce-core/helpers/event";
import { getCommentReplyPointer } from "applesauce-common/helpers/comment";

export interface CommentNode { event: NostrEvent; children: CommentNode[]; depth: number }

export function commentParentId(event: NostrEvent, rootEventId: string): string | undefined {
  const pointer = getCommentReplyPointer(event);
  if (pointer?.type === "address") return undefined;
  if (pointer?.type === "event") return pointer.id === rootEventId ? undefined : pointer.id;
  // Historical WaveFunc comments omitted k/K and used NIP-10 markers.
  const legacy = event.tags.find(tag => tag[0] === "e" && tag[3] === "reply")
    ?? event.tags.find(tag => tag[0] === "e" && tag[3] !== "root");
  return legacy?.[1] === rootEventId ? undefined : legacy?.[1];
}

/** Missing parents and malformed cycles must never hide comments or recurse forever. */
export function buildCommentTree(events: NostrEvent[], rootEventId: string): CommentNode[] {
  const ordered = [...new Map(events.map(event => [event.id, event])).values()].sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id));
  const ids = new Set(ordered.map(event => event.id));
  const children = new Map<string, NostrEvent[]>();
  const roots: NostrEvent[] = [];
  for (const event of ordered) {
    const parent = commentParentId(event, rootEventId);
    if (!parent || !ids.has(parent) || parent === event.id) roots.push(event);
    else children.set(parent, [...(children.get(parent) ?? []), event]);
  }
  const visited = new Set<string>();
  const build = (event: NostrEvent, depth: number): CommentNode => {
    visited.add(event.id);
    const node: CommentNode = { event, depth, children: [] };
    for (const child of [...(children.get(event.id) ?? [])].reverse()) {
      if (depth < 32 && !visited.has(child.id)) node.children.push(build(child, depth + 1));
    }
    return node;
  };
  const result: CommentNode[] = [];
  for (const event of [...roots, ...ordered]) if (!visited.has(event.id)) result.push(build(event, 0));
  return result;
}
