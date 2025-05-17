export interface EnvConfig {
    // Standard Vite variables (available in import.meta.env)
    BASE_URL?: string
    MODE?: 'development' | 'production' | string
    DEV?: boolean
    PROD?: boolean
    SSR?: boolean

    // Wavefunc specific variables - must be VITE_ prefixed in .env files
    // This is the primary pubkey for the specific application instance (web vs. devices)
    VITE_APP_PUBKEY?: string

    // Variables primarily for the web app (SSR and client-side relay determination)
    VITE_PUBLIC_APP_ENV?: 'development' | 'production'
    VITE_PUBLIC_HOST?: string
    VITE_PUBLIC_WEB_PORT?: string

    // New variables for configuring relays specifically for the devices app from .env
    VITE_DEVICES_INITIAL_RELAYS?: string // Comma-separated list of main relays
    VITE_DEVICES_SEARCH_RELAYS?: string // Comma-separated list of search relays

    // Allow any other VITE_ prefixed variables that might be present
    [key: string]: any
}

// It's also useful to define the structure of the router context if it's shared
// For example, if AppRouterContext is used by both apps via common components or hooks.
// import { QueryClient } from '@tanstack/react-query';
// export type AppRouterContext = { queryClient: QueryClient | null; env: EnvConfig };
