import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useToast } from '@/lib/hooks/use-toast'
import { ndkActions } from '@/lib/store/ndk'
import { Loader2, Plus, Save, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'

export function RelaysSettings() {
    const [relays, setRelays] = useState<{ url: string; read: boolean; write: boolean }[]>([])
    const [newRelayUrl, setNewRelayUrl] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const { toast } = useToast()

    useEffect(() => {
        try {
            const savedRelays = localStorage.getItem('RELAY_LIST')
            if (savedRelays) {
                setRelays(JSON.parse(savedRelays))
            } else {
                // const currentRelays = ndkActions.getNDK()?
                // setRelays(currentRelays.map((url) => ({ url, read: true, write: true })))
            }
        } catch (error) {
            console.error('Failed to load relays:', error)
            toast({
                title: 'Error',
                description: 'Failed to load relay settings',
                variant: 'destructive',
            })
        }
    }, [toast])

    const handleAddRelay = () => {
        if (newRelayUrl && !relays.some((relay) => relay.url === newRelayUrl)) {
            // Validate URL format
            try {
                new URL(newRelayUrl)
                setRelays([...relays, { url: newRelayUrl, read: true, write: true }])
                setNewRelayUrl('')
            } catch (e) {
                toast({
                    title: 'Invalid URL',
                    description: 'Please enter a valid relay URL (e.g., wss://relay.example.com)',
                    variant: 'destructive',
                })
            }
        } else if (relays.some((relay) => relay.url === newRelayUrl)) {
            toast({
                title: 'Relay already exists',
                description: 'This relay is already in your list',
                variant: 'destructive',
            })
        }
    }

    const toggleRelayPermission = (index: number, type: 'read' | 'write') => {
        const updatedRelays = [...relays]
        updatedRelays[index] = {
            ...updatedRelays[index],
            [type]: !updatedRelays[index][type],
        }
        setRelays(updatedRelays)
    }

    const removeRelay = (index: number) => {
        setRelays(relays.filter((_, i) => i !== index))
    }

    const handleSaveRelays = async () => {
        try {
            setIsLoading(true)
            // await nostrService.updateRelays(relays)
            toast({
                title: 'Relays Updated',
                description: 'Your relay settings have been updated successfully',
            })
        } catch (error) {
            console.error('Failed to update relays:', error)
            toast({
                title: 'Error',
                description: 'Failed to update relay settings',
                variant: 'destructive',
            })
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Relay Settings</CardTitle>
                <CardDescription>Configure which Nostr relays you connect to</CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
                <div className="flex gap-2">
                    <Input
                        placeholder="wss://relay.example.com"
                        value={newRelayUrl}
                        onChange={(e) => setNewRelayUrl(e.target.value)}
                        className="flex-1"
                    />
                    <Button onClick={handleAddRelay}>
                        <Plus className="h-4 w-4 mr-1" />
                        Add
                    </Button>
                </div>

                <div className="rounded-md border">
                    <div className="grid grid-cols-[1fr,80px,80px,40px] gap-2 px-4 py-3 font-medium bg-muted border-b">
                        <div>Relay URL</div>
                        <div className="text-center">Read</div>
                        <div className="text-center">Write</div>
                        <div></div>
                    </div>

                    {relays.map((relay, index) => (
                        <div
                            key={relay.url}
                            className="grid grid-cols-[1fr,80px,80px,40px] gap-2 px-4 py-3 border-b last:border-b-0 items-center"
                        >
                            <div className="truncate text-sm" title={relay.url}>
                                {relay.url}
                            </div>
                            <div className="text-center">
                                <input
                                    type="checkbox"
                                    checked={relay.read}
                                    onChange={() => toggleRelayPermission(index, 'read')}
                                    className="h-4 w-4"
                                />
                            </div>
                            <div className="text-center">
                                <input
                                    type="checkbox"
                                    checked={relay.write}
                                    onChange={() => toggleRelayPermission(index, 'write')}
                                    className="h-4 w-4"
                                />
                            </div>
                            <div className="flex justify-center">
                                <button
                                    onClick={() => removeRelay(index)}
                                    className="text-destructive hover:text-destructive/80"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    ))}

                    {relays.length === 0 && (
                        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                            No relays configured. Add a relay above.
                        </div>
                    )}
                </div>
            </CardContent>

            <CardFooter className="flex justify-end">
                <Button onClick={handleSaveRelays} disabled={isLoading}>
                    {isLoading ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Updating...
                        </>
                    ) : (
                        <>
                            <Save className="mr-2 h-4 w-4" />
                            Save Relay Settings
                        </>
                    )}
                </Button>
            </CardFooter>
        </Card>
    )
}
