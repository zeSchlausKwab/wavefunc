import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router'
import { CheckerPattern } from '@wavefunc/common/src/components/CheckerPattern'
import { Header, LoginDialog, RadioPlayer } from '@wavefunc/common'

// Components
import Index from './pages/Index'
import StationView from './pages/StationView'

// Root Route with Layout
const rootRoute = createRootRoute({
    component: () => (
        <div className="relative min-h-screen flex flex-col bg-zinc-100">
            <CheckerPattern className="[mask-image:radial-gradient(900px_circle_at_center,white,transparent)]" />
            <div className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
                <Header />
            </div>

            <main className="mx-auto w-full max-w-full pb-40 px-2 lg:px-12">
                {/* Outlet renders the current active route */}
                <Outlet />
            </main>
            <LoginDialog />
            <RadioPlayer />
        </div>
    ),
})

// Index route (home)
const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: Index,
})

const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/settings',
    component: StationView,
})

// Station route (detail)
const stationRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/station/$naddr',
    component: StationView,
})

// Define the route tree
const routeTree = rootRoute.addChildren([indexRoute, stationRoute, settingsRoute])

// Create and export the router
export const router = createRouter({ routeTree })

// Register the router for type-safety
declare module '@tanstack/react-router' {
    interface Register {
        router: typeof router
    }
}
