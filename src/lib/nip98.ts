// NIP-98: HTTP Auth
// https://nostr-nips.com/nip-98
import { unpackEventFromToken, validateEvent } from "nostr-tools/nip98";
import type { Event } from "nostr-tools/pure";

export interface NIP98AuthEvent extends Event {
  kind: 27235;
  tags: string[][];
}

/**
 * Verify a NIP-98 authorization event from an HTTP request
 * Uses nostr-tools' NIP-98 implementation
 * @param authHeader - The Authorization header value (should start with "Nostr ")
 * @param url - The full URL of the request
 * @param method - The HTTP method (GET, POST, etc.)
 * @param expectedPubkey - Optional pubkey to verify against
 * @param body - Optional request body for payload validation
 * @returns The verified event if valid, null otherwise
 */
export async function verifyNIP98Auth(
  authHeader: string | null,
  url: string,
  method: string,
  expectedPubkey?: string,
  body?: any,
  debug = false
): Promise<NIP98AuthEvent | null> {
  if (!authHeader) {
    if (debug) console.error("❌ Missing Authorization header");
    return null;
  }

  try {
    // Extract token (with or without "Nostr " prefix)
    const token = authHeader.startsWith("Nostr ")
      ? authHeader.substring(6)
      : authHeader;

    if (debug) {
      console.log("NIP-98 Verification Debug:");
      console.log("  Expected URL:", url);
      console.log("  Expected Method:", method);
      console.log("  Expected Pubkey:", expectedPubkey || "(none)");
      console.log("  Has Body:", !!body);
    }

    // Unpack event from token
    const event = await unpackEventFromToken(token);

    if (debug) {
      console.log("  Event Pubkey:", event.pubkey);
      console.log("  Event Kind:", event.kind);
      console.log("  Event Created:", event.created_at);
      console.log("  Event Tags:", event.tags);
    }

    // Validate event using nostr-tools
    const isValid = await validateEvent(event, url, method, body);

    if (!isValid) {
      if (debug) console.error("❌ Event validation failed");
      return null;
    }

    // Verify pubkey if provided
    if (expectedPubkey && event.pubkey !== expectedPubkey) {
      if (debug) console.error("❌ Pubkey mismatch:", event.pubkey, "!=", expectedPubkey);
      return null;
    }

    if (debug) console.log("✅ NIP-98 verification successful");

    return event as NIP98AuthEvent;
  } catch (error) {
    if (debug) console.error("❌ Failed to verify NIP-98 auth:", error);
    return null;
  }
}