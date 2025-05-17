import { createRootRouteWithContext, HeadContent, Outlet } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import type { AppRouterContext } from '@wavefunc/common'
import { EditStationDrawer, Header, LoginDialog, RadioPlayer, uiStore } from '@wavefunc/common'
import { HistoryDrawer } from '@wavefunc/common/src/components/radio/HistoryDrawer'
import type { Station } from '@wavefunc/common/src/types/station'
import { Toaster } from '@wavefunc/ui/components/ui/sonner'

function Providers({ children }: { children: React.ReactNode }) {
    const drawer = useStore(uiStore, (state) => state.stationDrawer)
    const station = drawer.station as Station | undefined
    const isOpen = drawer.isOpen

    return (
        <>
            {children}
            <Toaster />
            <EditStationDrawer isOpen={isOpen} station={station} />
            <HistoryDrawer />
        </>
    )
}

export const Route = createRootRouteWithContext<AppRouterContext>()({
    component: () => (
        <Providers>
            <div className="relative min-h-screen flex flex-col bg-zinc-100">
                {/* <CheckerPattern className="[mask-image:radial-gradient(900px_circle_at_center,white,transparent)]" /> */}
                <HeadContent />
                <div className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
                    <Header />
                </div>

                <main className="w-full max-w-full pb-40 px-2 lg:px-12">
                    <Outlet />
                </main>
                <LoginDialog />
                <RadioPlayer />
            </div>

            {/* {process.env.NODE_ENV === 'development' && <TanStackRouterDevtools />} */}
        </Providers>
    ),
})
