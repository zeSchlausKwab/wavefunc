import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '@wavefunc/ui/index.css'
import './index.css'

// Initialize router and styles
// Register the router for typesafety
import { router } from './routeConfig'

// Initialize the router
void router.load()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)
