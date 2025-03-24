import { Button } from '@/components/ui/button'
import { auth } from '@/lib/store/auth'
import { type ComponentPropsWithoutRef } from 'react'
import { useStore } from '@tanstack/react-store'
import { UserCircle2, Loader2, Settings, LogIn } from 'lucide-react'
import { Profile } from '../Profile'
import { Link } from '@tanstack/react-router'

interface AuthButtonProps extends Omit<ComponentPropsWithoutRef<typeof Button>, 'children'> {
    compact?: boolean
}

export function AuthButton({ compact = false, ...props }: AuthButtonProps) {
    const authState = useStore(auth.store)

    if (authState.status === 'loading') {
        return (
            <Button disabled variant="ghost" {...props}>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                <span>Connecting...</span>
            </Button>
        )
    }

    if (authState.status === 'authenticated') {
        return (
            <div className="flex items-center gap-2">
                <Link to="/settings">
                    <Button variant="ghost" size="icon" title="Settings">
                        <Settings className="h-4 w-4" />
                    </Button>
                </Link>
                <Profile compact={compact} />
            </div>
        )
    }

    // Unauthenticated state
    if (authState.status === 'unauthenticated') {
        return (
            <div className="flex items-center gap-2">
                <Link to="/settings">
                    <Button variant="ghost" size="icon" title="Settings">
                        <Settings className="h-4 w-4" />
                    </Button>
                </Link>
                <Button
                    variant="outline"
                    size={compact ? 'sm' : 'default'}
                    onClick={() => auth.openLoginDialog()}
                    {...props}
                >
                    <LogIn className="h-4 w-4 mr-2" />
                    {!compact && <span>Sign In</span>}
                </Button>
            </div>
        )
    }

    // Error or any other state - show basic login button
    return (
        <Button variant="outline" onClick={() => auth.openLoginDialog()} {...props}>
            <UserCircle2 className="h-4 w-4 mr-2" />
            <span>Sign In</span>
        </Button>
    )
}
