import React, { useRef, useState, useEffect } from 'react'
import {
    NavigationMenu,
    NavigationMenuItem,
    NavigationMenuList,
    navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu'
import { cn } from '@/lib/utils'
import { Link, useRouter } from '@tanstack/react-router'
import { useMedia } from 'react-use'
import { Radio, Headphones, Disc } from 'lucide-react'

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

    // Reset hover effect when route changes
    useEffect(() => {
        setHoverPosition(prev => ({ ...prev, opacity: 0 }))
    }, [router.state.location.pathname])

    const handleNavClick = () => {
        if (onNavigate && isMobile) {
            onNavigate()
        }
    }

    return (
        <div 
            ref={navRef}
            className={cn(
                "relative w-full",
                isMobile ? "px-2" : "px-4"
            )}
            onMouseLeave={() => setHoverPosition(prev => ({ ...prev, opacity: 0 }))}
        >
            <NavigationMenu className="w-full">
                <NavigationMenuList 
                    className={cn(
                        "relative",
                        isMobile 
                            ? "flex-col w-full space-y-2 p-2" 
                            : "flex-row justify-center border-2 border-black bg-background rounded-full p-1"
                    )}
                >
                    {!isMobile && (
                        <div
                            style={{
                                position: 'absolute',
                                left: `${hoverPosition.left}px`,
                                width: `${hoverPosition.width}px`,
                                opacity: hoverPosition.opacity,
                                height: '36px',
                                zIndex: 0,
                                borderRadius: '9999px',
                                backgroundColor: 'var(--primary)',
                                transition: 'all 0.3s ease'
                            }}
                        />
                    )}
                    
                    {routes.map((route) => {
                        const isActive = router.state.location.pathname === route.href;
                        return (
                            <NavigationMenuItem 
                                key={route.href} 
                                className={cn(
                                    isMobile && "w-full",
                                    "relative"
                                )}
                            >
                                <Link
                                    to={route.href}
                                    onClick={handleNavClick}
                                    onMouseEnter={(e) => {
                                        if (isMobile) return;
                                        const target = e.currentTarget;
                                        const { width } = target.getBoundingClientRect();
                                        const left = target.offsetLeft;
                                        
                                        setHoverPosition({
                                            width,
                                            opacity: 1,
                                            left,
                                        });
                                    }}
                                    className={cn(
                                        "relative z-10 flex items-center justify-center",
                                        "transition-all duration-200",
                                        "text-sm font-medium",
                                        isMobile 
                                            ? "w-full justify-start p-3 rounded-lg border-2 border-black" 
                                            : "px-4 py-2 rounded-full",
                                        isActive
                                            ? isMobile 
                                                ? "bg-primary text-primary-foreground border-primary" 
                                                : "text-background mix-blend-difference"
                                            : isMobile
                                                ? "bg-background text-foreground hover:bg-accent/50" 
                                                : "text-foreground hover:text-background"
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
