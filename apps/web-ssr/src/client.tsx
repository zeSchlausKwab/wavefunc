import React from 'react'
import { hydrateRoot } from 'react-dom/client'
import { createClientRouter, AppRouter } from './router'

// Initialize the client router
const router = createClientRouter()

// Initialize the router
router.load()

// Hydrate the app
hydrateRoot(document.getElementById('root') as HTMLElement, <AppRouter router={router} />)
