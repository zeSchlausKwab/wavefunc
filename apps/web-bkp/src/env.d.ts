/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_HOST: string
    readonly VITE_PORT: string
    readonly VITE_API_URL: string
    // Add other env variables here
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
