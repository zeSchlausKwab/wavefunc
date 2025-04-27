import { NavigationMenu, NavigationMenuItem, NavigationMenuList } from '@wavefunc/ui/components/ui/navigation-menu'
import { cn } from '@wavefunc/common'
import { Link, useRouter } from '@tanstack/react-router'
import { Disc, Headphones, Radio } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useMedia } from 'react-use'

const routes = [
    { href: '/favourites', label: 'Favourites', icon: <Radio className="h-4 w-4 mr-1.5" /> },
    { href: '/discover', label: 'Discover', icon: <Disc className="h-4 w-4 mr-1.5" /> },
    { href: '/about', label: 'About', icon: <Headphones className="h-4 w-4 mr-1.5" /> },
]

interface NavProps {
    onNavigate?: () => void
}

export function Nav({ onNavigate }: NavProps) {
    const router = useRouter()
    const isMobile = useMedia('(max-width: 640px)')
    const [hoverPosition, setHoverPosition] = useState({
        left: 0,
        width: 0,
        opacity: 0,
    })
    const navRef = useRef<HTMLDivElement>(null)
    const activeItemRef = useRef<HTMLAnchorElement>(null)
    const currentPath = router.state.location.pathname

    // Update highlight for active route when component mounts or route changes
    useEffect(() => {
        if (!isMobile && activeItemRef.current) {
            const activeItem = activeItemRef.current
            const { width } = activeItem.getBoundingClientRect()
            const left = activeItem.offsetLeft

            // First reset, then set with a small delay to ensure smooth transition
            setHoverPosition({ left: 0, width: 0, opacity: 0 })

            const timer = setTimeout(() => {
                setHoverPosition({
                    width,
                    left,
                    opacity: 1,
                })
            }, 100)

            return () => clearTimeout(timer)
        }
    }, [currentPath, isMobile, navRef.current])

    const handleNavClick = () => {
        if (onNavigate && isMobile) {
            onNavigate()
        }
    }

    return (
        <div
            ref={navRef}
            className={cn('relative w-full', isMobile ? 'px-2' : 'px-4')}
            onMouseLeave={() => {
                if (!isMobile && activeItemRef.current) {
                    // When mouse leaves, highlight active item
                    const activeItem = activeItemRef.current
                    const { width } = activeItem.getBoundingClientRect()
                    const left = activeItem.offsetLeft

                    setHoverPosition({
                        width,
                        left,
                        opacity: 1,
                    })
                } else {
                    setHoverPosition((prev) => ({ ...prev, opacity: 0 }))
                }
            }}
        >
            <NavigationMenu className="w-full">
                <NavigationMenuList
                    className={cn(
                        'relative',
                        isMobile
                            ? 'flex-col w-full space-y-2 p-2'
                            : 'flex-row justify-center border-2 border-black bg-background rounded-full p-1',
                    )}
                >
                    {!isMobile && (
                        <div
                            style={{
                                position: 'absolute',
                                left: `${hoverPosition.left}px`,
                                width: `${hoverPosition.width}px`,
                                height: '34px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                zIndex: 0,
                                borderRadius: '9999px',
                                backgroundColor: 'var(--primary-foreground, rgba(0, 0, 0, 0.1))',
                                boxShadow: '0 0 5px 0 rgba(0, 0, 0, 0.05)',
                                opacity: hoverPosition.opacity * 0.7,
                                transition: 'all 0.3s ease',
                            }}
                        />
                    )}

                    {routes.map((route) => {
                        const isActive = currentPath === route.href
                        return (
                            <NavigationMenuItem key={route.href} className={cn(isMobile && 'w-full', 'relative')}>
                                <Link
                                    to={route.href}
                                    ref={isActive ? activeItemRef : undefined}
                                    onClick={handleNavClick}
                                    onMouseEnter={(e) => {
                                        if (isMobile) return

                                        // Use getBoundingClientRect for more accurate measurements
                                        const target = e.currentTarget
                                        const navRect = navRef.current?.getBoundingClientRect()
                                        const targetRect = target.getBoundingClientRect()

                                        if (navRect) {
                                            // Calculate position relative to the navigation container
                                            const left = targetRect.left - navRect.left + 1 // +1px adjustment for better alignment

                                            setHoverPosition({
                                                width: targetRect.width - 2, // -2px for better fit
                                                opacity: 1,
                                                left,
                                            })
                                        }
                                    }}
                                    className={cn(
                                        'relative z-10 flex items-center justify-center',
                                        'transition-all duration-200',
                                        'text-sm font-medium',
                                        isMobile
                                            ? 'w-full justify-start p-3 rounded-lg border-2 border-black'
                                            : 'px-4 py-2 rounded-full',
                                        isActive
                                            ? isMobile
                                                ? 'bg-primary text-primary-foreground border-primary'
                                                : 'text-primary font-bold'
                                            : isMobile
                                              ? 'bg-background text-foreground hover:bg-accent/50'
                                              : 'text-foreground hover:text-primary',
                                    )}
                                >
                                    {route.icon}
                                    {route.label}
                                </Link>
                            </NavigationMenuItem>
                        )
                    })}
                </NavigationMenuList>
            </NavigationMenu>
        </div>
    )
}
