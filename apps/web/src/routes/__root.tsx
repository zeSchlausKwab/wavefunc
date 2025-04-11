import { LoginDialog } from '@/components/auth/LoginDialog'
import { EditStationDrawer } from '@/components/EditStationDrawer'
import { Header } from '@/components/Header'
import { RadioPlayer } from '@/components/RadioPlayer'
import { CheckerPattern } from '@/components/ui/CheckerPattern'
import { Toaster } from '@/components/ui/sonner'
import { uiStore } from '@/lib/store/ui'
import { createRootRoute, HeadContent, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { useStore } from '@tanstack/react-store'
import type { Station } from '@wavefunc/common/types/station'

function Providers({ children }: { children: React.ReactNode }) {
    const drawer = useStore(uiStore, (state) => state.stationDrawer)
    const station = drawer.station as Station | undefined
    const isOpen = drawer.isOpen

    return (
        <>
            {children}
            <Toaster />
            <EditStationDrawer isOpen={isOpen} station={station} />
        </>
    )
}

export const Route = createRootRoute({
    component: () => (
        <Providers>
            <div className="relative min-h-screen flex flex-col bg-zinc-100">
                <CheckerPattern className="[mask-image:radial-gradient(900px_circle_at_center,white,transparent)]" />
                {/* <DotPattern className="[mask-image:radial-gradient(900px_circle_at_center,white,transparent)]" /> */}
                <HeadContent />
                <div className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
                    <Header />
                </div>

                <main className="mx-auto w-full max-w-full pb-40 px-12">
                    <Outlet />
                </main>
                <LoginDialog />
                <RadioPlayer />
            </div>

            {process.env.NODE_ENV === 'development' && <TanStackRouterDevtools />}
        </Providers>
    ),
})
