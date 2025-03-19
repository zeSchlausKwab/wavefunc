import { Header } from '@/components/Header'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { EditStationDrawer } from '@/components/EditStationDrawer'
import { useStore } from '@tanstack/react-store'
import { uiStore } from '@/lib/store/ui'
import { RadioPlayer } from '@/components/RadioPlayer'
import type { Station } from '@wavefunc/common/types/station'

function Providers({ children }: { children: React.ReactNode }) {
    const drawer = useStore(uiStore, (state) => state.stationDrawer)
    const station = drawer.station as Station | undefined
    const isOpen = drawer.isOpen

    return (
        <>
            {children}
            <EditStationDrawer isOpen={isOpen} station={station} />
        </>
    )
}

export const Route = createRootRoute({
    component: () => (
        <Providers>
            <div className="min-h-screen flex flex-col">
                <div className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
                    <Header />
                </div>

                <main className="flex-1 container mx-auto px-4 py-6">
                    <Outlet />
                </main>

                <RadioPlayer />
            </div>

            {process.env.NODE_ENV === 'development' && <TanStackRouterDevtools />}
        </Providers>
    ),
})
