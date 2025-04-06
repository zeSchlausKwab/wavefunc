import {
    NavigationMenu,
    NavigationMenuItem,
    NavigationMenuList,
    navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu'
import { cn } from '@/lib/utils'
import { Link, useRouter } from '@tanstack/react-router'
import { useMedia } from 'react-use'

const routes = [
    { href: '/', label: 'Home' },
    { href: '/favourites', label: 'Favourites' },
    { href: '/discover', label: 'Discover' },
    { href: '/about', label: 'About' },
]

interface NavProps {
    onNavigate?: () => void
}

export function Nav({ onNavigate }: NavProps) {
    const router = useRouter()
    const isMobile = useMedia('(max-width: 640px)')

    const handleNavClick = () => {
        if (onNavigate && isMobile) {
            onNavigate()
        }
    }

    return (
        <NavigationMenu className="w-full">
            <NavigationMenuList className={cn(isMobile ? 'flex-col w-full space-y-1' : 'flex-row justify-center')}>
                {routes.map((route) => (
                    <NavigationMenuItem key={route.href} className={cn(isMobile && 'w-full')}>
                        <Link
                            to={route.href}
                            onClick={handleNavClick}
                            className={cn(
                                navigationMenuTriggerStyle(),
                                'font-press-start-2p text-sm',
                                isMobile ? 'w-full justify-center' : '',
                                router.state.location.pathname === route.href
                                    ? 'text-primary font-medium bg-accent/30'
                                    : 'text-muted-foreground',
                            )}
                        >
                            {route.label}
                        </Link>
                    </NavigationMenuItem>
                ))}
            </NavigationMenuList>
        </NavigationMenu>
    )
}
