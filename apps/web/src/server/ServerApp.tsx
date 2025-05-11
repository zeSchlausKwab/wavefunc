import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { EnvConfig } from '@wavefunc/common'
import App from '../App'

interface ServerAppProps {
    envConfig: EnvConfig // Passed from server, App will use this
    // Add other props App might need directly from server if any
}

export function ServerApp({ envConfig }: ServerAppProps) {
    // Create a new QueryClient instance for each server-side render.
    // This is important to prevent data sharing between requests.
    const queryClient = new QueryClient()

    return (
        <QueryClientProvider client={queryClient}>
            {/* Pass envConfig to App so it can use it immediately */}
            <App initialEnvConfig={envConfig} />
        </QueryClientProvider>
    )
}
