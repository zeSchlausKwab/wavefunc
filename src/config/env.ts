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
 * - Android emulator: Uses 10.0.2.2 to reach host machine
 * - iOS simulator: Can use localhost
 * - Desktop: Uses localhost
 * - Web: Uses localhost (for development)
 */
async function getRelayUrl(): Promise<string> {
  // Check for environment variable first
  const envRelayUrl = getEnv('RELAY_URL');
  if (envRelayUrl) {
    return envRelayUrl;
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