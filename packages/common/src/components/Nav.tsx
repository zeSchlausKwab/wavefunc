import { Link } from '@tanstack/react-router'
import { cn } from '@wavefunc/common'
import { NavigationMenu, NavigationMenuItem, NavigationMenuList } from '@wavefunc/ui/components/ui/navigation-menu'
import { Disc, Headphones, MessageCircle, Radio } from 'lucide-react'
import { useMedia } from 'react-use'

const routes = [
    { href: '/favourites', label: 'Favourites', icon: <Radio className="h-4 w-4 mr-1.5" /> },
    { href: '/discover', label: 'Discover', icon: <Disc className="h-4 w-4 mr-1.5" /> },
    { href: '/legacy', label: 'Legacy', icon: <Radio className="h-4 w-4 mr-1.5" /> },
    { href: '/about', label: 'About', icon: <Headphones className="h-4 w-4 mr-1.5" /> },
    { href: '/community', label: 'Community', icon: <MessageCircle className="h-4 w-4 mr-1.5" /> },
]

interface NavProps {
    onNavigate?: () => void
}

export function Nav({ onNavigate }: NavProps) {
    const isMobile = useMedia('(max-width: 640px)')

    const handleNavClick = () => {
        if (onNavigate && isMobile) {
            onNavigate()
        }
    }

    return (
        <div className={cn('w-full', isMobile ? 'px-2' : 'px-4')}>
            <NavigationMenu className="w-full max-w-none">
                <NavigationMenuList
                    className={cn(
                        'relative',
                        isMobile
                            ? 'flex-col w-full space-y-2 p-2'
                            : 'flex-row justify-center border-2 border-black bg-background h-10',
                    )}
                >
                    {routes.map((route) => {
                        return (
                            <NavigationMenuItem
                                key={route.href}
                                className={cn(isMobile ? 'w-full' : 'h-full', 'relative')}
                            >
                                <Link
                                    to={route.href}
                                    onClick={handleNavClick}
                                    className={cn(
                                        'flex items-center h-full',
                                        'transition-colors duration-200',
                                        'text-sm font-medium',
                                        isMobile ? 'w-full justify-start p-3 border-2 border-black' : 'px-4 h-full',
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
