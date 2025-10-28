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
  relayUrl: 'ws://localhost:3334', // Default value
};

/**
 * Initialize environment configuration
 * Call this early in your app initialization
 */
export async function initConfig(): Promise<void> {
  config.relayUrl = await getRelayUrl();
  console.log('📡 Relay URL configured:', config.relayUrl);
}