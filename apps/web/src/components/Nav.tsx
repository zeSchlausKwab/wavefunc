import {
    NavigationMenu,
    NavigationMenuItem,
    NavigationMenuList,
    navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu'
import { cn } from '@/lib/utils'
import { Link, useRouter } from '@tanstack/react-router'

const routes = [
    { href: '/discover', label: 'Discover' },
    { href: '/browse', label: 'Browse' },
    { href: '/about', label: 'About' },
]

export function Nav() {
    const router = useRouter()

    return (
        <NavigationMenu>
            <NavigationMenuList className="flex-col sm:flex-row">
                {routes.map((route) => (
                    <NavigationMenuItem key={route.href}>
                        <Link
                            to={route.href}
                            className={cn(
                                navigationMenuTriggerStyle(),
                                'font-press-start-2p text-sm w-full sm:w-auto text-center sm:text-left',
                                router.state.location.pathname === route.href
                                    ? 'text-primary font-medium'
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
