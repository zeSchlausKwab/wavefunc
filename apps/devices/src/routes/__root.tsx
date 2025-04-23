import { LoginDialog } from '@wavefunc/common'
import { Header } from '@wavefunc/common'
import { RadioPlayer } from '@wavefunc/common'
import { Toaster } from '@wavefunc/ui/components/ui/sonner'
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import type { AppRouterContext } from '@wavefunc/common'
import { CheckerPattern } from '@wavefunc/common/src/components/CheckerPattern'

function Providers({ children }: { children: React.ReactNode }) {
    return (
        <>
            {children}
            <Toaster />
        </>
    )
}

export const Route = createRootRouteWithContext<AppRouterContext>()({
    component: () => (
        <Providers>
            <div className="relative min-h-screen flex flex-col bg-zinc-100">
                <CheckerPattern className="[mask-image:radial-gradient(900px_circle_at_center,white,transparent)]" />
                <div className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
                    <Header />
                </div>

                <main className="mx-auto w-full max-w-full pb-40 px-2 lg:px-12">
                    <Outlet />
                </main>
                <LoginDialog />
                <RadioPlayer />
            </div>
        </Providers>
    ),
})
