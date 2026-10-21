/**
 * Browser polyfills for Node.js built-in APIs
 * Import this at the top of your app entry point
 */

// Ensure global is defined in the browser
if (typeof window !== 'undefined' && typeof global === 'undefined') {
  (window as any).global = window;
}

// Ensure process is defined
if (typeof process === 'undefined') {
  (window as any).process = { env: {} };
}

// Polyfill crypto.randomUUID for browsers that don't support it
if (typeof crypto !== 'undefined' && !crypto.randomUUID) {
  crypto.randomUUID = function randomUUID() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
}

export {};
