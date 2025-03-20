import { Button } from '@/components/ui/button'
import { Plus, Menu, AlertTriangle } from 'lucide-react'
import { useState, useEffect } from 'react'
import { openCreateStationDrawer } from '@/lib/store/ui'
import { authStore } from '@/lib/store/auth'
import { LoginDialog } from './auth/LoginDialog'
import { AuthButton } from './auth/AuthButton'
import { Nav } from './Nav'
import { useStore } from '@tanstack/react-store'
import { Link } from '@tanstack/react-router'
import { Alert, AlertDescription } from '@/components/ui/alert'

export function Header() {
    const authState = useStore(authStore)
    const [isNavOpen, setIsNavOpen] = useState(false)
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) {
        return null
    }

    const handleCreateStation = () => {
        openCreateStationDrawer()
    }

    return (
        <header className="flex flex-col sm:flex-row items-center p-4 gap-4 bg-white shadow-md">
            <div className="flex items-center justify-between w-full sm:w-auto">
                <Link to="/" className="text-2xl font-bold font-press-start-2p">
                    Wavef(u)nc
                </Link>
                <Button variant="ghost" size="icon" className="sm:hidden" onClick={() => setIsNavOpen(!isNavOpen)}>
                    <Menu className="h-5 w-5" />
                </Button>
            </div>
            <div className={`${isNavOpen ? 'block' : 'hidden'} sm:block w-full sm:w-auto`}>
                <Nav />
            </div>

            <Alert variant="destructive" className="my-2 flex items-center">
                <AlertTriangle className="h-4 w-4 mr-2" />
                <AlertDescription>
                    Warning: This app is restricted to one relay which WILL be nuked. Use at your own risk.
                </AlertDescription>
            </Alert>

            <div className="flex items-center space-x-4 flex-1 justify-end">
                {authState.status === 'authenticated' && (
                    <Button
                        variant="outline"
                        size="icon"
                        className="bg-green-500 hover:bg-green-600 text-white"
                        onClick={handleCreateStation}
                    >
                        <Plus className="h-5 w-5" />
                    </Button>
                )}
                <AuthButton variant="outline" className="flex items-center space-x-2" />
            </div>
            <LoginDialog />
        </header>
    )
}
