// Declaration file for environment variables
// This will provide autocompletion and type checking for process.env and Bun.env

declare module 'bun' {
    interface Env {
        // App environment
        PUBLIC_APP_ENV: string

        // Primary Database
        POSTGRES_USER: string
        POSTGRES_PASSWORD: string
        POSTGRES_DB: string
        POSTGRES_PORT: string
        POSTGRES_HOST: string
        POSTGRES_CONNECTION_STRING: string

        // Secondary Database
        POSTGRES_SECONDARY_USER: string
        POSTGRES_SECONDARY_PASSWORD: string
        POSTGRES_SECONDARY_DB: string
        POSTGRES_SECONDARY_PORT: string
        POSTGRES_SECONDARY_HOST: string
        POSTGRES_SECONDARY_CONNECTION_STRING: string

        // Relay Configuration
        VITE_PUBLIC_RELAY_PORT: string
        PUBLIC_RELAY_PUBKEY: string
        PUBLIC_RELAY_CONTACT: string

        // Public settings
        VITE_PUBLIC_HOST: string
        VITE_PUBLIC_API_PORT: string
        VITE_PUBLIC_WEB_PORT: string

        // DVM Configuration
        DVM_PRIVATE_KEY: string

        // AudD Configuration
        AUDD_API_TOKEN: string

        // Blossom Configuration
        PUBLIC_BLOSSOM_URL: string
        PUBLIC_BLOSSOM_PORT: string

        // Add any other environment variables your application uses
        // For optional environment variables, use the following pattern:
        // OPTIONAL_VAR?: string;
    }
}

declare namespace NodeJS {
    interface ProcessEnv extends Bun.Env {}
}

export {}
