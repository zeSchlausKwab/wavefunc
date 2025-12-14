/**
 * Simple local storage-based database for tracking sent Cashu tokens.
 * These are tokens we've created and given away, but may want to reclaim
 * if they're not redeemed within a certain timeframe.
 */

export interface SentToken {
  id: string; // unique identifier
  token: string; // encoded cashu token
  amount: number; // sats
  mint: string; // mint URL
  createdAt: number; // timestamp
  description?: string;
  reclaimed?: boolean; // whether we've reclaimed this token
}

const STORAGE_KEY = "wavefunc_sent_tokens";
const MAX_AGE_DAYS = 30; // Auto-cleanup tokens older than 30 days

/**
 * Generate a unique 5-character ID for tracking tokens
 */
export function generateTokenId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 5; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

/**
 * Get all sent tokens from local storage
 */
function getAllTokens(): SentToken[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch (error) {
    console.error("Failed to load sent tokens:", error);
    return [];
  }
}

/**
 * Save all tokens to local storage
 */
function saveAllTokens(tokens: SentToken[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  } catch (error) {
    console.error("Failed to save sent tokens:", error);
  }
}

/**
 * Save a new sent token
 */
export function saveSentToken(
  token: string,
  amount: number,
  mint: string,
  description?: string
): string {
  const id = generateTokenId();
  const sentToken: SentToken = {
    id,
    token,
    amount,
    mint,
    createdAt: Date.now(),
    description: description || `Token sent #${id}`,
    reclaimed: false,
  };

  const tokens = getAllTokens();
  tokens.push(sentToken);
  saveAllTokens(tokens);

  return id;
}

/**
 * Get a sent token by ID
 */
export function getSentTokenById(id: string): SentToken | null {
  const tokens = getAllTokens();
  return tokens.find((t) => t.id === id) || null;
}

/**
 * Mark a token as reclaimed
 */
export function markTokenAsReclaimed(id: string): boolean {
  const tokens = getAllTokens();
  const token = tokens.find((t) => t.id === id);
  if (!token) return false;

  token.reclaimed = true;
  saveAllTokens(tokens);
  return true;
}

/**
 * Delete a token by ID
 */
export function deleteSentToken(id: string): boolean {
  const tokens = getAllTokens();
  const filtered = tokens.filter((t) => t.id !== id);
  if (filtered.length === tokens.length) return false;

  saveAllTokens(filtered);
  return true;
}

/**
 * Get all unredeemed sent tokens
 */
export function getUnredeemedTokens(): SentToken[] {
  const tokens = getAllTokens();
  return tokens.filter((t) => !t.reclaimed);
}

/**
 * Clean up old tokens (older than MAX_AGE_DAYS)
 */
export function cleanupOldTokens(): number {
  const tokens = getAllTokens();
  const cutoffDate = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

  const filtered = tokens.filter((t) => t.createdAt > cutoffDate);
  const removedCount = tokens.length - filtered.length;

  if (removedCount > 0) {
    saveAllTokens(filtered);
    console.log(`Cleaned up ${removedCount} old sent tokens`);
  }

  return removedCount;
}

/**
 * Get total amount in unredeemed sent tokens
 */
export function getTotalUnredeemedAmount(): number {
  const unredeemed = getUnredeemedTokens();
  return unredeemed.reduce((sum, t) => sum + t.amount, 0);
}

/**
 * Export all tokens for backup
 */
export function exportTokens(): string {
  const tokens = getAllTokens();
  return JSON.stringify(tokens, null, 2);
}

/**
 * Import tokens from backup
 */
export function importTokens(jsonData: string): boolean {
  try {
    const tokens = JSON.parse(jsonData);
    if (!Array.isArray(tokens)) return false;

    saveAllTokens(tokens);
    return true;
  } catch (error) {
    console.error("Failed to import tokens:", error);
    return false;
  }
}
