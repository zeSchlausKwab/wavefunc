import { Store } from '@tanstack/store'

export interface EnvConfig {
    VITE_PUBLIC_HOST: string
    VITE_PUBLIC_APP_ENV: string // Change type to string
    VITE_APP_PUBKEY: string // App's public key for NIP-78 app-specific data
    [key: string]: string // Allow other env variables
}

interface EnvState {
    env: EnvConfig | null
}

const initialState: EnvState = {
    env: null,
}

export const envStore = new Store<EnvState>(initialState)

export const envActions = {
    initialize: async () => {
        const env = await fetch('/envConfig').then((res) => res.json())
        envStore.setState((state) => ({ ...state, env }))
        return env
    },
    setEnv: (env: EnvConfig) => {
        envStore.setState((state) => ({ ...state, env }))
    },
    getEnv: () => {
        return envStore.state.env
    },
}

export const useEnv = () => {
    return {
        ...envStore.state,
        ...envActions,
    }
}
