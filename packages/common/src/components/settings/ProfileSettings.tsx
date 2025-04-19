import { authStore } from '@wavefunc/common'
import { ndkActions } from '@wavefunc/common'
import { uiActions } from '@wavefunc/common'
import { NDKSubscriptionCacheUsage, type NDKUserProfile } from '@nostr-dev-kit/ndk'
import { useStore } from '@tanstack/react-store'
import { updateUserProfile } from '@wavefunc/common'
import { Check, Globe, Loader2, LogIn, Save, User, Zap } from 'lucide-react'
import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@wavefunc/ui/components/ui/card'
import { Label } from '@wavefunc/ui/components/ui/label'
import { Input } from '@wavefunc/ui/components/ui/input'
import { Button } from '@wavefunc/ui/components/ui/button'

export function ProfileSettings() {
    const [isProfileLoading, setIsProfileLoading] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [saveSuccess, setSaveSuccess] = useState(false)
    const authState = useStore(authStore)

    const [profile, setProfile] = useState<NDKUserProfile>({
        name: '',
        displayName: '',
        about: '',
        picture: '',
        image: '',
        banner: '',
        website: '',
        nip05: '',
        lud06: '',
        lud16: '',
    })

    const canEditProfile = authState.isAuthenticated

    const handleLoginClick = () => {
        uiActions.openAuthDialog()
    }

    const handleProfileChange = (field: keyof NDKUserProfile, value: string) => {
        setProfile((prev) => ({
            ...prev,
            [field]: value,
            ...(field === 'picture' ? { image: value } : {}),
            ...(field === 'image' ? { picture: value } : {}),
            ...(field === 'name' ? { displayName: value } : {}),
        }))
    }

    const handleSubmitProfile = async (e: FormEvent) => {
        e.preventDefault()
        setSaveSuccess(false)

        if (!authState.user?.pubkey) {
            console.error('Auth state:', authState.isAuthenticated, 'Pubkey available:', !!authState.user?.pubkey)
            toast('Authentication Required', {
                description: 'Please sign in to save your profile settings',
                style: {
                    background: 'red',
                },
            })
            uiActions.openAuthDialog()
            return
        }

        setIsSubmitting(true)
        try {
            const ndk = ndkActions.getNDK()
            if (!ndk) {
                throw new Error('NDK not available')
            }

            if (!ndk.signer) {
                throw new Error('No signer available')
            }

            const preparedProfile: NDKUserProfile = {
                name: profile.name || '',
                displayName: profile.name || '',
                about: profile.about || '',
                picture: profile.picture || profile.image || '',
                image: profile.picture || profile.image || '',
                banner: profile.banner || '',
                website: profile.website || '',
                nip05: profile.nip05 || '',
                lud06: profile.lud06 || '',
                lud16: profile.lud16 || '',
            }

            await updateUserProfile(ndk, preparedProfile, true)
            setProfile(preparedProfile)

            setSaveSuccess(true)
            setTimeout(() => setSaveSuccess(false), 3000)

            toast('Profile Updated', {
                description: 'Your profile has been updated successfully',
            })
        } catch (error) {
            console.error('Failed to update profile:', error)
            toast('Error', {
                description: `Failed to update profile: ${error instanceof Error ? error.message : 'Unknown error'}`,
                style: {
                    background: 'red',
                },
            })
        } finally {
            setIsSubmitting(false)
        }
    }

    useEffect(() => {
        const fetchUserProfile = async () => {
            if (!authState.user?.pubkey) return

            setIsProfileLoading(true)
            try {
                const ndk = ndkActions.getNDK()
                if (!ndk) return

                const user = ndk.getUser({ pubkey: authState.user.pubkey })
                const fetchedProfile = await user.fetchProfile({
                    cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY,
                })

                if (fetchedProfile) {
                    setProfile(fetchedProfile)
                }
            } catch (error) {
                console.error('Failed to fetch profile:', error)
                toast('Error', {
                    description: 'Failed to load profile data',
                    style: {
                        background: 'red',
                    },
                })
            } finally {
                setIsProfileLoading(false)
            }
        }

        fetchUserProfile()
    }, [authState.user?.pubkey])

    const resetProfile = () => {
        setProfile({
            name: '',
            displayName: '',
            about: '',
            picture: '',
            image: '',
            banner: '',
            website: '',
            nip05: '',
            lud06: '',
            lud16: '',
        })
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Profile Settings</CardTitle>
                <CardDescription>Manage your Nostr profile information</CardDescription>
            </CardHeader>

            {!canEditProfile ? (
                <CardContent className="space-y-6">
                    <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
                        <div className="bg-muted rounded-full p-3">
                            <User className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-lg font-medium">Authentication Required</h3>
                            <p className="text-sm text-muted-foreground max-w-md">
                                You need to sign in with your Nostr identity to update your profile settings. Anonymous
                                browsing doesn't allow profile changes.
                            </p>
                        </div>
                        <Button onClick={handleLoginClick} className="mt-4">
                            <LogIn className="h-4 w-4 mr-2" />
                            Sign In
                        </Button>
                    </div>
                </CardContent>
            ) : (
                <form onSubmit={handleSubmitProfile}>
                    <CardContent className="space-y-6">
                        {isProfileLoading ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <>
                                <div className="space-y-4">
                                    <h3 className="text-lg font-medium flex items-center gap-2">
                                        <User className="h-4 w-4" />
                                        Basic Information
                                    </h3>

                                    <div className="flex items-center gap-4">
                                        <Avatar className="h-20 w-20">
                                            <AvatarImage src={profile.picture || profile.image} alt="Profile" />
                                            <AvatarFallback>
                                                {(profile.name || '').substring(0, 2) || '?'}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1">
                                            <Label htmlFor="picture" className="text-sm font-medium mb-2 block">
                                                Profile Picture URL
                                            </Label>
                                            <Input
                                                id="picture"
                                                placeholder="https://example.com/avatar.jpg"
                                                value={profile.picture || profile.image || ''}
                                                onChange={(e) => handleProfileChange('picture', e.target.value)}
                                            />
                                            <p className="text-xs text-muted-foreground mt-1">
                                                Direct link to an image file
                                            </p>
                                        </div>
                                    </div>

                                    <div>
                                        <Label htmlFor="banner" className="text-sm font-medium mb-2 block">
                                            Banner Image URL
                                        </Label>
                                        <Input
                                            id="banner"
                                            placeholder="https://example.com/banner.jpg"
                                            value={profile.banner || ''}
                                            onChange={(e) => handleProfileChange('banner', e.target.value)}
                                        />
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Optional banner image for your profile
                                        </p>
                                        {profile.banner && (
                                            <div
                                                className="mt-2 relative rounded-md overflow-hidden"
                                                style={{ height: '120px' }}
                                            >
                                                <img
                                                    src={profile.banner}
                                                    alt="Banner preview"
                                                    className="w-full h-full object-cover"
                                                    onError={(e) => {
                                                        ;(e.target as HTMLImageElement).style.display = 'none'
                                                        toast('Error', {
                                                            description: 'Failed to load banner image',
                                                            style: { background: 'red' },
                                                        })
                                                    }}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <div>
                                        <Label htmlFor="name" className="text-sm font-medium mb-2 block">
                                            Display Name
                                        </Label>
                                        <Input
                                            id="name"
                                            placeholder="Your name"
                                            value={profile.name || ''}
                                            onChange={(e) => handleProfileChange('name', e.target.value)}
                                        />
                                    </div>

                                    <div>
                                        <Label htmlFor="about" className="text-sm font-medium mb-2 block">
                                            About
                                        </Label>
                                        <Textarea
                                            id="about"
                                            placeholder="Tell people about yourself"
                                            value={profile.about || ''}
                                            onChange={(e) => handleProfileChange('about', e.target.value)}
                                            className="min-h-[120px]"
                                        />
                                    </div>
                                </div>

                                <hr className="my-4" />

                                <div className="space-y-4">
                                    <h3 className="text-lg font-medium flex items-center gap-2">
                                        <Globe className="h-4 w-4" />
                                        Web & Verification
                                    </h3>

                                    <div>
                                        <Label htmlFor="website" className="text-sm font-medium mb-2 block">
                                            Website
                                        </Label>
                                        <Input
                                            id="website"
                                            placeholder="https://yourdomain.com"
                                            value={profile.website || ''}
                                            onChange={(e) => handleProfileChange('website', e.target.value)}
                                        />
                                    </div>

                                    <div>
                                        <Label htmlFor="nip05" className="text-sm font-medium mb-2 block">
                                            NIP-05 Identifier
                                        </Label>
                                        <Input
                                            id="nip05"
                                            placeholder="you@domain.com"
                                            value={profile.nip05 || ''}
                                            onChange={(e) => handleProfileChange('nip05', e.target.value)}
                                        />
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Verifiable identifier that proves ownership of your profile
                                        </p>
                                    </div>
                                </div>

                                <hr className="my-4" />

                                <div className="space-y-4">
                                    <h3 className="text-lg font-medium flex items-center gap-2">
                                        <Zap className="h-4 w-4" />
                                        Lightning Payment Options
                                    </h3>

                                    <div>
                                        <Label htmlFor="lud16" className="text-sm font-medium mb-2 block">
                                            Lightning Address
                                        </Label>
                                        <Input
                                            id="lud16"
                                            placeholder="you@wallet.com"
                                            value={profile.lud16 || ''}
                                            onChange={(e) => handleProfileChange('lud16', e.target.value)}
                                        />
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Your Lightning address for receiving payments (like an email for Bitcoin)
                                        </p>
                                    </div>

                                    <div>
                                        <Label htmlFor="lud06" className="text-sm font-medium mb-2 block">
                                            LNURL
                                        </Label>
                                        <Input
                                            id="lud06"
                                            placeholder="LNURL..."
                                            value={profile.lud06 || ''}
                                            onChange={(e) => handleProfileChange('lud06', e.target.value)}
                                        />
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Alternative Lightning payment URL
                                        </p>
                                    </div>
                                </div>
                            </>
                        )}
                    </CardContent>

                    <CardFooter className="flex justify-end gap-2 mb-12">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={resetProfile}
                            disabled={isProfileLoading || isSubmitting}
                        >
                            Reset
                        </Button>
                        <Button
                            type="submit"
                            disabled={isProfileLoading || isSubmitting}
                            variant={saveSuccess ? 'secondary' : 'default'}
                            className={saveSuccess ? 'bg-green-500 hover:bg-green-600 text-white' : ''}
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Saving...
                                </>
                            ) : saveSuccess ? (
                                <>
                                    <Check className="mr-2 h-4 w-4" />
                                    Saved!
                                </>
                            ) : (
                                <>
                                    <Save className="mr-2 h-4 w-4" />
                                    Save Profile
                                </>
                            )}
                        </Button>
                    </CardFooter>
                </form>
            )}
        </Card>
    )
}
