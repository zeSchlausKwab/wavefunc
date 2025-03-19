import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { nostrService } from '@/lib/services/ndk'
import { PublicKeySchema, subscribeToFollowingList, type FollowingUpdate } from '@wavefunc/common'
import type { NDKUser } from '@nostr-dev-kit/ndk'
import { useEffect, useState } from 'react'
import { FollowingListRow } from './FollowingListRow'

type ProfileWithStatus = {
    profile: NDKUser | null
    loading: boolean
}

type Profiles = Map<string, ProfileWithStatus>

const MAX_FOLLOWERS = 50

export function FollowingList({ pubkey }: { pubkey: string }) {
    useEffect(() => {
        const result = PublicKeySchema.safeParse(pubkey)
        if (!result.success) {
            console.error('Invalid pubkey:', result.error)
        }
    }, [pubkey])

    const [following, setFollowing] = useState<Set<string>>(new Set())
    const [profiles, setProfiles] = useState<Profiles>(new Map())
    const [isLoading, setIsLoading] = useState(true)

    const fetchProfile = async (pubkey: string) => {
        setProfiles((prev) => new Map(prev).set(pubkey, { profile: null, loading: true }))

        try {
            const user = await nostrService.getNDK().getUser({ pubkey })
            await user.fetchProfile()
            setProfiles((prev) => new Map(prev).set(pubkey, { profile: user, loading: false }))
        } catch (error) {
            console.error('Error fetching profile:', error)
            setProfiles((prev) => new Map(prev).set(pubkey, { profile: null, loading: false }))
        }
    }

    useEffect(() => {
        setIsLoading(true)
        setFollowing(new Set())
        setProfiles(new Map())

        const handleUpdate = (update: FollowingUpdate) => {
            if (update.type === 'add' && update.pubkey) {
                setFollowing((prev) => new Set([...prev, update.pubkey!]))
                fetchProfile(update.pubkey)
            } else if (update.type === 'complete') {
                setIsLoading(false)
            }
        }

        nostrService.connect().then(() => {
            const cleanup = subscribeToFollowingList(nostrService.getNDK(), pubkey, MAX_FOLLOWERS, handleUpdate)

            return () => cleanup()
        })
    }, [pubkey])

    return (
        <Card>
            <CardHeader>
                <CardTitle>Following List ({following.size})</CardTitle>
            </CardHeader>
            <CardContent>
                {isLoading && following.size === 0 ? (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Profile</TableHead>
                                <TableHead>NIP-05</TableHead>
                                <TableHead>About</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {[...Array(3)].map((_, i) => (
                                <FollowingListRow key={i} pubkey="" profileData={undefined} />
                            ))}
                        </TableBody>
                    </Table>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Profile</TableHead>
                                <TableHead>NIP-05</TableHead>
                                <TableHead>About</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {Array.from(following).map((pubkey) => (
                                <FollowingListRow key={pubkey} pubkey={pubkey} profileData={profiles.get(pubkey)} />
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    )
}
