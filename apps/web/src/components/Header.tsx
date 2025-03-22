import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { authStore } from '@/lib/store/auth'
import { openCreateStationDrawer } from '@/lib/store/ui'
import { useStore } from '@tanstack/react-store'
import { AlertTriangle, Menu, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useMedia } from 'react-use'
import { AuthButton } from './auth/AuthButton'
import { LoginDialog } from './auth/LoginDialog'
import { Nav } from './Nav'
import { cn } from '@/lib/utils'

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
        <header className={cn('bg-white shadow-md p-4')}>
            <div className={cn('flex items-center', isMobile ? 'flex-col' : 'flex-row justify-between')}>
                <div className={cn('flex items-center', isMobile ? 'justify-between w-full' : 'gap-4')}>
                    <a href="/" className="text-2xl font-bold font-press-start-2p">
                        Wavef(u)nc
                    </a>

                    <Button variant="ghost" size="icon" className="sm:hidden" onClick={() => setIsNavOpen(!isNavOpen)}>
                        <IconWrapper icon={Menu} />
                    </Button>
                </div>

                <div className={cn(isMobile ? 'w-full mt-2' : 'flex items-center justify-center flex-1 mx-4')}>
                    {isMobile ? (
                        <div
                            className={cn(
                                'absolute left-0 right-0 bg-white z-50 p-4 shadow-md',
                                isNavOpen ? 'block' : 'hidden',
                            )}
                        >
                            <Nav />
                        </div>
                    ) : (
                        <Nav />
                    )}
                </div>

                <div className={cn('flex items-center', isMobile ? 'justify-end w-full mt-2' : 'gap-2')}>
                    {isMobile ? (
                        <>
                            <div className="relative">
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8 p-0"
                                    onClick={() => setShowWarningTooltip(!showWarningTooltip)}
                                >
                                    <IconWrapper icon={AlertTriangle} className="h-4 w-4 text-destructive" />
                                </Button>

                                {showWarningTooltip && (
                                    <div className="absolute right-0 top-full mt-2 bg-black text-white text-xs p-2 rounded shadow-lg z-50 w-48">
                                        Warning: Limited relay. Will be nuked.
                                        <div className="absolute -top-1 right-3 w-2 h-2 bg-black transform rotate-45"></div>
                                    </div>
                                )}
                            </div>

                            {authState.status === 'authenticated' && (
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="bg-green-500 hover:bg-green-600 text-white h-8 w-8 p-0 ml-2"
                                    onClick={handleCreateStation}
                                >
                                    <IconWrapper icon={Plus} className="h-4 w-4" />
                                </Button>
                            )}
                            <AuthButton variant="outline" compact className="ml-2" />
                        </>
                    ) : (
                        <>
                            <Alert variant="destructive" className="flex items-center py-2 px-3 max-w-xl">
                                <IconWrapper icon={AlertTriangle} className="h-4 w-4 mr-2" />
                                <AlertDescription>
                                    Warning: This app is restricted to one relay which WILL be nuked. Use at your own
                                    risk.
                                </AlertDescription>
                            </Alert>

                            <div className="flex items-center gap-2">
                                {authState.status === 'authenticated' && (
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="bg-green-500 hover:bg-green-600 text-white"
                                        onClick={handleCreateStation}
                                    >
                                        <IconWrapper icon={Plus} />
                                    </Button>
                                )}
                                <AuthButton variant="outline" />
                            </div>
                        </>
                    )}
                </div>
            </div>
            <LoginDialog />
        </header>
    )
}
