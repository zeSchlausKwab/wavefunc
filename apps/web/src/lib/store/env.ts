import { Store } from '@tanstack/store'

export interface EnvConfig {
    VITE_PUBLIC_HOST: string
    VITE_PUBLIC_APP_ENV: string
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
}

export const useEnv = () => {
    return {
        ...envStore.state,
        ...envActions,
    }
}
