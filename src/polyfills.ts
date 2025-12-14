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
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };
}

export {};
