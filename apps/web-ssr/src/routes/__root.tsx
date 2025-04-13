import { createRootRoute, Outlet, useNavigate } from '@tanstack/react-router'

export const Route = createRootRoute({
    component: RootComponent,
})

function RootComponent() {
    return <RootLayout />
}

function RootLayout() {
    return (
        <div className="flex flex-col min-h-screen">
            <main className="flex-grow">
                <Outlet />
            </main>
        </div>
    )
}
