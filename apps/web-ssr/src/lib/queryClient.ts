import { QueryClient } from '@tanstack/react-query'

// Initialize NDK and create a queryClient only after initialization
export async function createQueryClient(): Promise<QueryClient> {
    return new QueryClient()
}
