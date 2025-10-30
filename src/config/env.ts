/**
 * Environment configuration for WaveFunc
 *
 * This file handles environment-specific settings like relay URLs
 * which differ between desktop, Android, and iOS platforms.
 */

/**
 * Detect if running in Tauri (desktop or mobile)
 */
const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

/**
 * Get environment variable value (works in both Node and browser contexts)
 */
function getEnv(key: string): string | undefined {
  // In Node.js/Bun server context
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  // In browser, these are replaced at build time
  return undefined;
}

/**
 * Detect platform when running in Tauri
 */
async function getPlatform(): Promise<string | null> {
  if (!isTauri) return null;

  try {
    // @ts-ignore - Tauri API may not be typed yet
    const { platform } = await import('@tauri-apps/api/os');
    return await platform();
  } catch {
    return null;
  }
}

/**
 * Get the appropriate relay URL based on platform
 *
 * - Production web: Uses current host with /relay path
 * - Development: Uses localhost:3334
 * - Android emulator: Uses 10.0.2.2 to reach host machine
 * - iOS/Desktop: Uses localhost
 */
async function getRelayUrl(): Promise<string> {
  // Check for environment variable first (set at build time)
  const envRelayUrl = getEnv('RELAY_URL');
  if (envRelayUrl) {
    return envRelayUrl;
  }

  // If running in browser (not Tauri), construct from current location
  if (typeof window !== 'undefined' && !isTauri) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;

    // In production, use /relay path (proxied by Caddy)
    // In development (localhost:3000), connect directly to :3334
    if (host.includes('localhost') || host.includes('127.0.0.1')) {
      const devHost = host.split(':')[0];
      return `${protocol}//${devHost}:3334`;
    } else {
      return `${protocol}//${host}/relay`;
    }
  }

  const platformName = await getPlatform();

  // Android emulator needs special IP to reach host machine
  if (platformName === 'android') {
    return 'ws://10.0.2.2:3334';
  }

  // All other platforms can use localhost
  return 'ws://localhost:3334';
}

/**
 * Environment configuration object
 * Initialize this at app startup
 */
export const config = {
  relayUrl: getEnv('RELAY_URL') || 'ws://localhost:3334', // Default value
};

/**
 * Initialize environment configuration
 * Call this early in your app initialization
 */
export async function initConfig(): Promise<void> {
  config.relayUrl = await getRelayUrl();
  console.log('📡 Relay URL configured:', config.relayUrl);
}