import {
    Outlet,
    RouterProvider,
    createBrowserHistory,
    createMemoryHistory,
    createRootRouteWithContext,
    createRoute,
    createRouter,
} from '@tanstack/react-router'

import AboutPage from './pages/AboutPage'
import HomePage from './pages/HomePage'

// Root component that will wrap all routes
function Root() {
    return (
        <div>
            <Outlet />
        </div>
    )
}

// Create root route with layout
const rootRoute = createRootRouteWithContext()({
    component: Root,
})

// Create index route
const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: HomePage,
})

// Create about route
const aboutRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/about',
    component: AboutPage,
})

// Create the route tree
const routeTree = rootRoute.addChildren([indexRoute, aboutRoute])

// Types for router context
type RouterContext = {}

// Create the router instance for the client
export function createClientRouter() {
    return createRouter({
        routeTree,
        context: {} as RouterContext,
        defaultPreload: 'intent',
        defaultPreloadStaleTime: 0,
        history: typeof window !== 'undefined' ? createBrowserHistory() : undefined,
    })
}

// Create the router instance for the server
export function createServerRouter(url: string) {
    return createRouter({
        routeTree,
        context: {} as RouterContext,
        defaultPreload: false,
        history: createMemoryHistory({
            initialEntries: [url],
        }),
    })
}

// Register the router for client-side hydration
declare module '@tanstack/react-router' {
    interface Register {
        router: ReturnType<typeof createClientRouter>
    }
}

// Router Provider component
export function AppRouter({ router }: { router: ReturnType<typeof createClientRouter> }) {
    return <RouterProvider router={router} />
}
