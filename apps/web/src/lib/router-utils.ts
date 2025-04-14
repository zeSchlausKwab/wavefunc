import { QueryClient } from '@tanstack/react-query'

export interface EnvConfig {
    VITE_PUBLIC_HOST: string
    VITE_PUBLIC_APP_ENV: string
    [key: string]: string
}

export interface AppRouterContext {
    queryClient: QueryClient
    env: EnvConfig
}

export function getQueryClient(context: any): QueryClient {
    return (context as AppRouterContext).queryClient
}
