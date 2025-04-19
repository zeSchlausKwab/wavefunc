import { Nip05Badge } from '@wavefunc/common'
import { Button } from '@wavefunc/ui/components/ui/button'
import { ndkActions } from '@wavefunc/common'
import { useAutoAnimate } from '@formkit/auto-animate/react'
import { NDKSubscriptionCacheUsage } from '@nostr-dev-kit/ndk'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, CheckCircle2, MessageCircle, Minus, Plus, Share2, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'

interface UserProfile {
    name?: string
    displayName?: string
    about?: string
    picture?: string
    banner?: string
    website?: string
    nip05?: string
}

// Utility functions
function truncateText(text: string, maxLength: number): string {
    if (!text) return ''
    if (text.length <= maxLength) return text
    return text.slice(0, maxLength) + '...'
}

function getHexColorFingerprintFromHexPubkey(pubkey: string): string {
    if (!pubkey) return '#6665DD'
    // Generate a simple hash-based color
    let hash = 0
    for (let i = 0; i < pubkey.length; i++) {
        hash = pubkey.charCodeAt(i) + ((hash << 5) - hash)
    }
    let color = '#'
    for (let i = 0; i < 3; i++) {
        const value = (hash >> (i * 8)) & 0xff
        color += ('00' + value.toString(16)).substr(-2)
    }
    return color
}

export const Route = createFileRoute('/profile/$profileId')({
    component: ProfilePage,
})

function ProfilePage() {
    const { profileId } = Route.useParams()
    const [animationParent] = useAutoAnimate()
    const [showFullAbout, setShowFullAbout] = useState(false)
    const isMobile = window.innerWidth < 640

    const { data: profile, isLoading } = useQuery({
        queryKey: ['profile-detail', profileId],
        queryFn: async () => {
            const ndk = ndkActions.getNDK()
            if (!ndk) throw new Error('NDK not available')

            const user = ndk.getUser({ pubkey: profileId })
            const userProfile = await user.fetchProfile({
                cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY,
            })

            if (!userProfile) return null

            return {
                name: userProfile.name || 'Anonymous',
                displayName: userProfile.displayName,
                about: userProfile.about,
                picture: userProfile.picture,
                banner: userProfile.banner,
                website: userProfile.website,
                nip05: userProfile.nip05,
            } as UserProfile
        },
        staleTime: 1000 * 60 * 5, // 5 minutes
    })

    useEffect(() => {
        console.log('Profile ID:', profileId)
    }, [profileId])

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-screen">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        )
    }

    return (
        <div className="relative min-h-screen">
            <div className="flex flex-col pb-4 relative z-10">
                <div className="relative">
                    <Button
                        variant="ghost"
                        onClick={() => window.history.back()}
                        className="absolute top-4 left-4 z-10 flex items-center gap-2"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        <span>Back</span>
                    </Button>

                    {profile?.banner ? (
                        <div className="w-full aspect-[5/1] overflow-hidden flex items-center justify-center">
                            <img src={profile.banner} alt="profile-banner" className="w-full h-full object-cover" />
                        </div>
                    ) : (
                        <div
                            className="w-full aspect-[5/1] relative overflow-hidden"
                            style={{
                                background: `linear-gradient(45deg, ${getHexColorFingerprintFromHexPubkey(profileId)} 0%, #000 100%)`,
                                opacity: 0.8,
                            }}
                        />
                    )}
                </div>

                {profile?.about && (
                    <div
                        ref={animationParent}
                        className="flex flex-row items-center px-8 py-4 bg-zinc-900 text-sm text-white"
                    >
                        {(() => {
                            const aboutTruncated = truncateText(profile.about, 70)
                            if (aboutTruncated !== profile.about) {
                                return (
                                    <>
                                        <p className="break-words">{showFullAbout ? profile.about : aboutTruncated}</p>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => setShowFullAbout(!showFullAbout)}
                                        >
                                            {showFullAbout ? (
                                                <Minus className="w-4 h-4" />
                                            ) : (
                                                <Plus className="w-4 h-4" />
                                            )}
                                        </Button>
                                    </>
                                )
                            }
                            return <p className="break-words">{profile.about}</p>
                        })()}
                    </div>
                )}

                <div className="flex flex-row justify-between px-8 py-4 bg-black items-center">
                    <div className="flex flex-row items-center gap-4">
                        {profile?.picture && (
                            <img
                                src={profile.picture}
                                alt={profile.name || 'Profile picture'}
                                className="rounded-full w-12 h-12 border-2 border-white"
                            />
                        )}
                        <div className="flex items-center gap-2">
                            <h2 className="text-2xl font-bold text-white">
                                {truncateText(profile?.name ?? 'Unnamed user', isMobile ? 10 : 50)}
                            </h2>
                            <Nip05Badge userId={profileId} />
                        </div>
                    </div>
                    {!isMobile && (
                        <div className="flex gap-2">
                            <Button variant="outline" size="icon">
                                <Zap className="w-5 h-5" />
                            </Button>
                            <Button variant="outline" size="icon">
                                <MessageCircle className="w-5 h-5" />
                            </Button>
                            <Button variant="outline" size="icon">
                                <Share2 className="w-5 h-5" />
                            </Button>
                        </div>
                    )}
                </div>

                <div className="px-8 py-6">
                    <h3 className="text-2xl font-bold mb-6 uppercase">Profile Details</h3>

                    <div className="grid grid-cols-1 gap-4">
                        <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden bg-white dark:bg-zinc-900 p-4">
                            <h4 className="text-lg font-bold mb-2">Public Key</h4>
                            <div className="bg-zinc-100 dark:bg-zinc-800 p-2 rounded-md overflow-x-auto">
                                <code className="text-xs">{profileId}</code>
                            </div>

                            {profile?.website && (
                                <div className="mt-4">
                                    <h4 className="text-lg font-bold mb-2">Website</h4>
                                    <a
                                        href={profile.website}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-500 hover:underline break-all"
                                    >
                                        {profile.website}
                                    </a>
                                </div>
                            )}

                            {profile?.nip05 && (
                                <div className="mt-4">
                                    <h4 className="text-lg font-bold mb-2">NIP-05 Identifier</h4>
                                    <div className="flex items-center gap-2">
                                        <span>{profile.nip05}</span>
                                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="px-8 py-6">
                    <Link to="/" className="text-blue-500 hover:underline">
                        ← Back to Radio Stations
                    </Link>
                </div>
            </div>
        </div>
    )
}
