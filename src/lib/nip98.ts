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
  body?: any
): Promise<NIP98AuthEvent | null> {
  if (!authHeader) {
    return null;
  }

  try {
    // Extract token (with or without "Nostr " prefix)
    const token = authHeader.startsWith("Nostr ")
      ? authHeader.substring(6)
      : authHeader;

    // Unpack event from token
    const event = await unpackEventFromToken(token);

    // Validate event using nostr-tools (signature, kind, timestamp, URL, method, payload)
    const isValid = await validateEvent(event, url, method, body);

    if (!isValid) {
      return null;
    }

    // Verify pubkey if provided
    if (expectedPubkey && event.pubkey !== expectedPubkey) {
      return null;
    }

    return event as NIP98AuthEvent;
  } catch (error) {
    // Silent fail - invalid token format or verification failed
    return null;
  }
}