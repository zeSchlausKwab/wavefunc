import { useState, useEffect } from 'react'
import { ndkActions } from '@/lib/store/ndk'
import { RelayDataTable } from '../relays/data-table'
import { columns, type Relay } from '../relays/columns'
import { toast } from 'sonner'

export function RelaysSettings() {
    const [relays, setRelays] = useState<Relay[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        // Load relays from the NDK store
        try {
            setLoading(true)
            const currentRelays = ndkActions.getRelays()
            setRelays(currentRelays)
        } catch (error) {
            console.error('Failed to load relays:', error)
            toast('Error', {
                description: 'Failed to load relay settings',
                style: {
                    background: 'red',
                },
            })
        } finally {
            setLoading(false)
        }
    }, [])

    if (loading) {
        return <div className="flex justify-center py-8">Loading relay settings...</div>
    }

    return <RelayDataTable columns={columns} data={relays} onRowsChange={setRelays} />
}
