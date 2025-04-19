/**
 * Polyfills for Node.js built-ins used by md5 and crypto
 */

// Ensure global is defined in the browser
if (typeof window !== 'undefined' && typeof global === 'undefined') {
    (window as any).global = window;
}

// Ensure process is defined
if (typeof process === 'undefined') {
    (window as any).process = { env: {} };
}

export {}; 