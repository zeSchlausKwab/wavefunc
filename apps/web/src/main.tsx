import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { nostrService } from '@wavefunc/common'

import { routeTree } from './routeTree.gen'

// Initialize the NDK service
nostrService.init({
    host: import.meta.env.VITE_PUBLIC_HOST || 'localhost',
    relayPort: import.meta.env.VITE_PUBLIC_RELAY_PORT || 3002,
    webPort: import.meta.env.VITE_PUBLIC_WEB_PORT || 8080,
    useCache: true,
    enableLogging: import.meta.env.DEV,
})

// Create router and query client before connecting to NDK
const queryClient = new QueryClient()
const router = createRouter({
    routeTree,
    context: {
        queryClient,
    },
})

// Register router for type-safety
declare module '@tanstack/react-router' {
    interface Register {
        router: typeof router
    }
}

// Connect to relays in the background after router is created
nostrService
    .connect()
    .then(() => {
        console.log('Connected to NDK relays')
    })
    .catch((err) => {
        console.warn('Failed to connect to NDK relays:', err)
    })

// Render the application
const rootElement = document.getElementById('root')!
if (!rootElement.innerHTML) {
    const root = ReactDOM.createRoot(rootElement)
    root.render(
        <StrictMode>
            <QueryClientProvider client={queryClient}>
                <RouterProvider router={router} />
            </QueryClientProvider>
        </StrictMode>,
    )
}
