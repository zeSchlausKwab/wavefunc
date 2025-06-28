// Declaration file for environment variables
// This will provide autocompletion and type checking for process.env and Bun.env

declare module 'bun' {
    interface Env {
        // =============================================================================
        // APPLICATION SETTINGS
        // =============================================================================
        VITE_PUBLIC_APP_ENV: string
        VITE_APP_PUBKEY: string
        APP_PRIVATE_KEY: string

        // Public Keys & Identifiers
        FEATURED_STATIONS_PUBKEY: string
        DVMCP_FALLBACK_PUBKEY: string

        // App Metadata
        APP_USER_AGENT: string
        PUBLIC_BASE_URL: string
        APP_LOGO_URL: string
        DEFAULT_STATION_IMAGE_URL: string
        DEFAULT_FEATURED_IMAGE_URL: string
        NIP05_VERIFICATION: string

        // =============================================================================
        // NETWORK CONFIGURATION
        // =============================================================================
        VITE_PUBLIC_HOST: string
        VITE_PUBLIC_WEB_PORT: string
        VITE_PUBLIC_API_PORT: string
        VITE_PUBLIC_RELAY_PORT: string

        // =============================================================================
        // NOSTR RELAY CONFIGURATION
        // =============================================================================
        RELAY_PRIVATE_KEY: string
        NOSTR_RELAY_URLS: string
        DEFAULT_RELAY_URLS: string
        NOSTR_CONNECT_RELAY_URL: string

        // =============================================================================
        // DATABASE CONFIGURATION
        // =============================================================================

        // Primary Database (Nostr relay event storage)
        POSTGRES_HOST: string
        POSTGRES_PORT: string
        POSTGRES_USER: string
        POSTGRES_PASSWORD: string
        POSTGRES_DB: string
        POSTGRES_CONNECTION_STRING: string

        // =============================================================================
        // DVM (Data Verification Method) CONFIGURATION
        // =============================================================================
        DVM_PRIVATE_KEY: string
        DVM_RELAY_URLS: string
        DVM_LIGHTNING_ADDRESS: string
        DVM_LIGHTNING_ZAP_RELAYS: string

        // =============================================================================
        // EXTERNAL SERVICES
        // =============================================================================

        // Music Recognition (AudD API)
        AUDD_API_TOKEN: string
        AUDD_API_URL: string

        // Music Metadata (Discogs API)
        DISCOGS_PA_TOKEN: string
        DISCOGS_API_URL: string

        // MusicBrainz API
        MUSICBRAINZ_API_URL: string

        // Radio Browser API
        RADIO_BROWSER_API_URL: string

        // File Storage (Blossom Server)
        PUBLIC_BLOSSOM_URL: string

        // =============================================================================
        // DEVELOPMENT SETTINGS
        // =============================================================================
        TAURI_DEV_HOST?: string
    }
}

declare namespace NodeJS {
    interface ProcessEnv extends Bun.Env {}
}

export {}
