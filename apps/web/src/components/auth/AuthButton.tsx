import { Button } from '@/components/ui/button'
import { auth } from '@/lib/store/auth'
import { type ComponentPropsWithoutRef } from 'react'
import { useStore } from '@tanstack/react-store'
import { UserCircle2, Shield, Loader2, Settings } from 'lucide-react'
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { formatPubkey, getPubkeyColor } from '@wavefunc/common'
import { Profile } from '../Profile'
import { Link } from '@tanstack/react-router'

interface AuthButtonProps extends Omit<ComponentPropsWithoutRef<typeof Button>, 'children'> {
    showAnonymousHint?: boolean
    compact?: boolean
}

export function AuthButton({ showAnonymousHint = true, compact = false, ...props }: AuthButtonProps) {
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

    if (authState.status === 'anonymous') {
        const pubkeyDisplay = authState.user?.pubkey ? formatPubkey(authState.user.pubkey) : ''
        const pubkeyColor = authState.user?.pubkey ? getPubkeyColor(authState.user.pubkey) : ''

        if (!showAnonymousHint || compact) {
            return (
                <div className="flex items-center gap-2">
                    <Link to="/settings">
                        <Button variant="ghost" size="icon" title="Settings">
                            <Settings className="h-4 w-4" />
                        </Button>
                    </Link>
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size={compact ? 'sm' : 'default'}
                                    onClick={() => auth.openLoginDialog()}
                                    {...props}
                                >
                                    <UserCircle2 className="h-4 w-4" style={{ color: pubkeyColor }} />
                                    {!compact && <span className="ml-2">Sign In</span>}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">
                                <p>Currently browsing anonymously as {pubkeyDisplay}</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            )
        }

        return (
            <div className="flex items-center gap-2">
                <Link to="/settings">
                    <Button variant="ghost" size="icon" title="Settings">
                        <Settings className="h-4 w-4" />
                    </Button>
                </Link>
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="outline"
                                onClick={() => auth.openLoginDialog()}
                                className="group"
                                {...props}
                            >
                                <UserCircle2 className="h-4 w-4 mr-2" style={{ color: pubkeyColor }} />
                                <span className="font-mono text-sm">{pubkeyDisplay}</span>
                                <Shield className="h-3 w-3 ml-2 text-yellow-500" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-[300px]">
                            <p>
                                You're browsing with a temporary identity ({pubkeyDisplay}). Sign in to save your
                                preferences, interact with others, and access all features.
                            </p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
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
