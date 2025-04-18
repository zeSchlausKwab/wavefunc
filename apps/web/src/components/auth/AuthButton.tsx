import { Button } from '@/components/ui/button'
import { authActions, authStore } from '@/lib/store/auth'
import { Link } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { Loader2, LogIn, Settings, UserCircle2 } from 'lucide-react'
import { type ComponentPropsWithoutRef } from 'react'
import { Profile } from '../Profile'
import { uiActions } from '@/lib/store/ui'

interface AuthButtonProps extends Omit<ComponentPropsWithoutRef<typeof Button>, 'children'> {
    compact?: boolean
}

export function AuthButton({ compact = false, ...props }: AuthButtonProps) {
    const authState = useStore(authStore)

    if (authState.isAuthenticating) {
        return (
            <Button disabled variant="ghost" {...props}>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                <span>Connecting...</span>
            </Button>
        )
    }

    if (authState.isAuthenticated) {
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
    if (!authState.isAuthenticated) {
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
                    onClick={() => uiActions.openAuthDialog()}
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
        <Button variant="outline" onClick={() => uiActions.openAuthDialog()} {...props}>
            <UserCircle2 className="h-4 w-4 mr-2" />
            <span>Sign In</span>
        </Button>
    )
}
