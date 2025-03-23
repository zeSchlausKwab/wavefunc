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
    { href: '/favourites', label: 'Favourites' },
    { href: '/discover', label: 'Discover' },
    { href: '/browse', label: 'Browse' },
    { href: '/about', label: 'About' },
]

export function Nav() {
    const router = useRouter()
    const isMobile = useMedia('(max-width: 640px)')

    return (
        <NavigationMenu className="w-full">
            <NavigationMenuList className={cn(isMobile ? 'flex-col w-full space-y-1' : 'flex-row justify-center')}>
                {routes.map((route) => (
                    <NavigationMenuItem key={route.href} className={cn(isMobile && 'w-full')}>
                        <Link
                            to={route.href}
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
