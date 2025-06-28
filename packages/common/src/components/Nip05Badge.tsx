import { CheckCircle2, XCircle } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@wavefunc/ui/components/ui/tooltip'
import { useProfile } from '../queries'

interface Nip05BadgeProps {
    userId: string
}

export function Nip05Badge({ userId }: Nip05BadgeProps) {
    const { data: profile, isLoading } = useProfile(userId)

    if (isLoading || !profile?.nip05) return null

    const verified = profile.nip05Verified ?? true // Use the verification status from the profile

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger>
                    <div className="flex items-center">
                        {verified ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                            <XCircle className="h-4 w-4 text-red-500" />
                        )}
                    </div>
                </TooltipTrigger>
                <TooltipContent>
                    <p className="text-xs">
                        {verified ? 'Verified' : 'Unverified'} NIP-05: {profile.nip05}
                    </p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}
