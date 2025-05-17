import { Link } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { authStore, cn, openCreateStationDrawer } from '@wavefunc/common'
import { Button } from '@wavefunc/ui/components/ui/button'
import { Menu, Plus, Radio } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useMedia } from 'react-use'
import { AuthButton } from './auth/AuthButton'
import { Nav } from './Nav'
import { SiteLinks } from './SiteLinks'
import { Sheet, SheetContent, SheetTrigger } from '@wavefunc/ui/components/ui/sheet'

export function Header() {
    const authState = useStore(authStore)
    const [isNavOpen, setIsNavOpen] = useState(false)
    const [mounted, setMounted] = useState(false)
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
        <header className={cn('py-4 px-6 border-b-4 border-black bg-background relative z-40')}>
            <div className="max-w-7xl mx-auto flex items-center justify-between">
                <div className="flex items-center gap-8">
                    <Link
                        to="/"
                        className="font-heading text-2xl flex items-center gap-2 hover:text-green-500 transition-colors"
                    >
                        <Radio className="h-6 w-6" />
                        {!isMobile ? (
                            <span className="font-bold tracking-tight">WaveF(u)nc</span>
                        ) : (
                            <span className="font-bold tracking-tight">Wf()</span>
                        )}
                    </Link>

                    <div className="hidden sm:flex">
                        <Nav />
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {!isMobile && (
                        <>
                            <SiteLinks />
                            {authState.isAuthenticated && (
                                <Button
                                    variant="default"
                                    size="icon"
                                    className={cn(
                                        'bg-green-500 hover:bg-green-600 text-white h-9 w-9',
                                        'border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]',
                                        'transition-transform hover:translate-y-[-2px]',
                                    )}
                                    onClick={handleCreateStation}
                                >
                                    <IconWrapper icon={Plus} className="h-4 w-4" />
                                </Button>
                            )}
                        </>
                    )}

                    <AuthButton
                        variant="secondary"
                        compact={isMobile}
                        className={cn(
                            'border-2 border-black',
                            'shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]',
                            'transition-transform hover:translate-y-[-2px]',
                        )}
                    />

                    {isMobile && (
                        <Sheet open={isNavOpen} onOpenChange={setIsNavOpen}>
                            <SheetTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className={cn(
                                        'border-2 border-black',
                                        'hover:bg-green-500 hover:text-white transition-colors',
                                        'shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]',
                                    )}
                                >
                                    <IconWrapper icon={Menu} />
                                </Button>
                            </SheetTrigger>
                            <SheetContent side="top" className={cn('sm:hidden border-black pt-4 bg-background')}>
                                <Nav onNavigate={() => setIsNavOpen(false)} />
                                <div className="mt-4 pt-4 border-t border-dashed border-gray-700 flex flex-col gap-2">
                                    <SiteLinks />
                                </div>
                                {authState.isAuthenticated && (
                                    <div className="mt-4 pt-4 border-t border-dashed border-gray-700">
                                        <Button
                                            variant="ghost"
                                            className="w-full justify-start text-left h-auto py-2 px-3 flex items-center gap-2 hover:bg-gray-700"
                                            onClick={() => {
                                                handleCreateStation()
                                                setIsNavOpen(false)
                                            }}
                                        >
                                            <Plus className="h-4 w-4" />
                                            Create New Station
                                        </Button>
                                    </div>
                                )}
                            </SheetContent>
                        </Sheet>
                    )}
                </div>
            </div>
        </header>
    )
}
