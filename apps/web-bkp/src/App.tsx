import { RouterProvider } from '@tanstack/react-router'
// import router from './router'
import React from 'react'

// Import the TanStack Router DevTools in development
const TanStackRouterDevtools =
    process.env.NODE_ENV === 'production'
        ? () => null // Render nothing in production
        : React.lazy(() =>
              import('@tanstack/router-devtools').then((res) => ({
                  default: res.TanStackRouterDevtools,
              })),
          )

export default function App() {
    return (
        <>
            {/* @ts-ignore - Ignoring React 19 compatibility issues */}
            <RouterProvider router={router} />
            {/* Add the dev tools */}
            {process.env.NODE_ENV !== 'production' && (
                <React.Suspense fallback={null}>
                    {/* @ts-ignore - Ignoring React 19 compatibility issues */}
                    <TanStackRouterDevtools router={router} position="bottom-right" />
                </React.Suspense>
            )}
        </>
    )
}
