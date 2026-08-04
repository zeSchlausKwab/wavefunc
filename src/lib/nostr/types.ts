import type { EventTemplate as CoreEventTemplate } from "applesauce-core/helpers/event";

/**
 * Application-level event draft. Applesauce v6 correctly models a signable
 * Nostr template as already timestamped; WaveFunc stamps drafts centrally at
 * signing time so domain builders cannot accidentally reuse stale timestamps.
 */
export type EventTemplate = Omit<CoreEventTemplate, "created_at"> & {
  created_at?: number;
};
