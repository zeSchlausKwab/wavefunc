import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { auth } from '@/lib/store/auth'
import { ProfileSettings } from '@/components/settings/ProfileSettings'
import { RelaysSettings } from '@/components/settings/RelaysSettings'
import { createFileRoute } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import { Network, User } from 'lucide-react'
import { useState } from 'react'

export const Route = createFileRoute('/settings')({
    component: Settings,
})

export default function Settings() {
    const [activeTab, setActiveTab] = useState('profile')
    const authState = useStore(auth.store)

    const renderUserIdentity = () => {
        if (authState.status === 'authenticated' || authState.status === 'anonymous') {
            const pubkey = authState.user?.pubkey || ''
            return (
                <div className="mb-6 p-4 bg-muted rounded-lg">
                    <h3 className="font-medium mb-2 flex items-center gap-2">
                        <User className="h-4 w-4" />
                        Your Identity
                    </h3>
                    <p className="text-sm text-muted-foreground mb-1">Public Key:</p>
                    <code className="text-xs bg-background p-2 rounded block overflow-x-auto">{pubkey}</code>
                    <p className="text-xs text-muted-foreground mt-2">
                        {authState.status === 'authenticated'
                            ? 'You are signed in with your Nostr identity.'
                            : 'You are browsing anonymously. Sign in to save your settings.'}
                    </p>
                </div>
            )
        }
        return null
    }

    return (
        <div className="container max-w-3xl py-10">
            <h1 className="text-3xl font-bold mb-8">Settings</h1>

            {renderUserIdentity()}

            <Tabs defaultValue="profile" value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid grid-cols-2 w-full mb-8">
                    <TabsTrigger value="profile" className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        Profile
                    </TabsTrigger>
                    <TabsTrigger value="relays" className="flex items-center gap-2">
                        <Network className="h-4 w-4" />
                        Relays
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="profile">
                    <ProfileSettings />
                </TabsContent>

                <TabsContent value="relays">
                    <RelaysSettings />
                </TabsContent>
            </Tabs>
        </div>
    )
}
