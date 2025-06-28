export interface EnvConfig {
    // Wavefunc specific variables - must be VITE_ prefixed in .env files
    // This is the primary pubkey for the specific application instance (web vs. devices)
    VITE_APP_PUBKEY?: string

    // Variables primarily for the web app (SSR and client-side relay determination)
    VITE_PUBLIC_APP_ENV?: 'development' | 'production'
    VITE_PUBLIC_HOST?: string
    VITE_PUBLIC_WEB_PORT?: string

    // Allow any other VITE_ prefixed variables that might be present
    [key: string]: any
}

// It's also useful to define the structure of the router context if it's shared
// For example, if AppRouterContext is used by both apps via common components or hooks.
// import { QueryClient } from '@tanstack/react-query';
// export type AppRouterContext = { queryClient: QueryClient | null; env: EnvConfig };
