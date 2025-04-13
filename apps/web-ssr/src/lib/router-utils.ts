import { QueryClient } from '@tanstack/react-query'

export interface AppRouterContext {
    queryClient: QueryClient
}

export function getQueryClient(context: any): QueryClient {
    return (context as AppRouterContext).queryClient
}
