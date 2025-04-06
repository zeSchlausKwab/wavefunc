import { Button } from '@/components/ui/button'
import { authStore } from '@/lib/store/auth'
import { openCreateStationDrawer } from '@/lib/store/ui'
import { cn } from '@/lib/utils'
import { useStore } from '@tanstack/react-store'
import { AlertTriangle, Menu, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useMedia } from 'react-use'
import { AuthButton } from './auth/AuthButton'
import { Nav } from './Nav'
import { Link } from '@tanstack/react-router'

export function Header() {
    const authState = useStore(authStore)
    const [isNavOpen, setIsNavOpen] = useState(false)
    const [mounted, setMounted] = useState(false)
    const [showWarningTooltip, setShowWarningTooltip] = useState(false)
    const isMobile = useMedia('(max-width: 640px)')

    useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) {
        return null
    }

    const handleCreateStation = () => {
        openCreateStationDrawer()
    }

    const IconWrapper = ({ icon: Icon, className = 'h-5 w-5' }: { icon: any; className?: string }) => {
        return <Icon className={className} />
    }

    return (
        <header className={cn('bg-white p-3')}>
            <div className="max-w-7xl mx-auto flex items-center justify-between">
                <div className="flex items-center gap-8">
                    <Link to="/" className="text-xl font-bold font-press-start-2p">
                        Wavef(u)nc
                    </Link>

                    <div className="hidden sm:flex">
                        <Nav />
                    </div>

                    <Button variant="ghost" size="icon" className="sm:hidden" onClick={() => setIsNavOpen(!isNavOpen)}>
                        <IconWrapper icon={Menu} />
                    </Button>
                </div>

                <div className="flex items-center gap-3">
                    {!isMobile && (
                        <div className="text-xs text-muted-foreground flex items-center">
                            <IconWrapper icon={AlertTriangle} className="h-3 w-3 mr-1 text-amber-500" />
                            <span>Limited relay - will be reset</span>
                        </div>
                    )}

                    {isMobile && (
                        <div className="relative">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 p-0"
                                onClick={() => setShowWarningTooltip(!showWarningTooltip)}
                            >
                                <IconWrapper icon={AlertTriangle} className="h-4 w-4 text-amber-500" />
                            </Button>

                            {showWarningTooltip && (
                                <div className="absolute right-0 top-full mt-2 bg-background text-foreground text-xs p-2 rounded shadow-lg z-50 w-48 border">
                                    Warning: Limited relay. Will be reset.
                                    <div className="absolute -top-1 right-3 w-2 h-2 bg-background transform rotate-45 border-t border-l"></div>
                                </div>
                            )}
                        </div>
                    )}

                    {authState.isAuthenticated && (
                        <Button
                            variant="outline"
                            size="icon"
                            className="bg-green-500 hover:bg-green-600 text-white h-8 w-8 p-0"
                            onClick={handleCreateStation}
                        >
                            <IconWrapper icon={Plus} className="h-4 w-4" />
                        </Button>
                    )}

                    <AuthButton variant="outline" compact={isMobile} />
                </div>
            </div>

            {isMobile && isNavOpen && (
                <div className="sm:hidden mt-2 border-t pt-2">
                    <Nav onNavigate={() => setIsNavOpen(false)} />
                </div>
            )}
        </header>
    )
}
