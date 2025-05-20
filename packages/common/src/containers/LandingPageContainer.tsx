import { useQueries } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import {
    AuthButton,
    authStore,
    cn,
    getSpecificFeaturedListByDTag,
    HOMEPAGE_LAYOUT,
    ndkActions,
    NDKEvent,
    openCreateStationDrawer,
    ZapDialog,
    type FeaturedList,
    type Station,
} from '@wavefunc/common'
import RadioCard from '@wavefunc/common/src/components/radio/RadioCard'
import { getLastPlayedStation, loadHistory } from '@wavefunc/common/src/lib/store/history'
import { setCurrentStation } from '@wavefunc/common/src/lib/store/stations'
import { Button } from '@wavefunc/ui/components/ui/button'
import { Headphones, Info, Loader2, Music, Plus, Radio, UserPlus, Zap } from 'lucide-react'
import { nip19 } from 'nostr-tools'
import { useEffect, useState } from 'react'
import { useMedia } from 'react-use'
import { toast } from 'sonner'

const homepageFeaturedListDTags = ['psych-alternative-indie', 'drone-ambient', 'electronic']
const DEV_NPUB = 'npub182jczunncwe0jn6frpqwq3e0qjws7yqqnc3auccqv9nte2dnd63scjm4rf'

interface LandingPageContainerProps {
    appPubKey: string | undefined
}

export function LandingPageContainer({ appPubKey }: LandingPageContainerProps) {
    const [isMobileWidth, setIsMobileWidth] = useState(() =>
        typeof window !== 'undefined' ? window.innerWidth <= 640 : false,
    )
    const isMobileMedia = useMedia('(max-width: 640px)', false)
    const isMobile = isMobileMedia || isMobileWidth

    useEffect(() => {
        const handleResize = () => {
            setIsMobileWidth(window.innerWidth <= 640)
        }
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    const authState = useStore(authStore)
    const [isAppZapDialogOpen, setIsAppZapDialogOpen] = useState(false)
    const [appZapEventForDialog, setAppZapEventForDialog] = useState<NDKEvent | null>(null)
    const [queryError, setQueryError] = useState<string | null>(null)
    const [ndkReady, setNdkReady] = useState(false)
    const [envReady, setEnvReady] = useState(false)
    const [isFollowingDev, setIsFollowingDev] = useState(false)

    useEffect(() => {
        loadHistory()
        const lastStation = getLastPlayedStation()
        if (lastStation) {
            setCurrentStation(lastStation)
        }
    }, [])

    useEffect(() => {
        const checkNdkAndEnv = () => {
            const ndkInstance = ndkActions.getNDK()
            const isNdkReady = !!ndkInstance
            const isEnvConfigReady = !!appPubKey

            setNdkReady(isNdkReady)
            setEnvReady(isEnvConfigReady)

            if (isNdkReady && isEnvConfigReady && appPubKey) {
                const tempEvent = new NDKEvent(ndkInstance)
                tempEvent.pubkey = appPubKey
                tempEvent.content = 'Wavefunc App'
                tempEvent.kind = 0
                setAppZapEventForDialog(tempEvent)
            } else {
                setAppZapEventForDialog(null)
            }
        }
        checkNdkAndEnv()
    }, [appPubKey])

    const featuredListQueries = useQueries({
        queries: homepageFeaturedListDTags.map((dTag) => ({
            queryKey: ['featured-list', dTag, appPubKey],
            queryFn: async () => {
                const ndk = ndkActions.getNDK()
                if (!ndk) {
                    console.error(`NDK not available for fetching list: ${dTag}`)
                    throw new Error('NDK not available')
                }
                if (!appPubKey) {
                    console.error(`VITE_APP_PUBKEY not available for fetching list: ${dTag}`)
                    throw new Error('VITE_APP_PUBKEY not available')
                }
                try {
                    const result = await getSpecificFeaturedListByDTag(ndk, dTag, appPubKey, {
                        withStations: true,
                    })
                    return result
                } catch (error) {
                    console.error(`Error fetching list ${dTag}:`, error)
                    throw error
                }
            },
            enabled: ndkReady && envReady,
            staleTime: 1000 * 60 * 5,
            retry: 3,
            retryDelay: (attempt: number) => Math.min(attempt > 1 ? 2000 * 2 ** attempt : 1000, 30000),
            onError: (error: Error) => {
                setQueryError(`Failed to load ${dTag}: ${error.message}`)
                console.error(`Query error for ${dTag}:`, error)
            },
        })),
    })

    const isLoading = featuredListQueries.some((query) => query.isLoading && query.fetchStatus !== 'idle')
    const hasError = featuredListQueries.some((query) => query.isError)

    const listForLayout1 = featuredListQueries[0]?.data ?? null
    const listForLayout2 = featuredListQueries[1]?.data ?? null
    const listForLayout3 = featuredListQueries[2]?.data ?? null
    const loadedFeaturedLists = [listForLayout1, listForLayout2, listForLayout3].filter(Boolean)

    const handleCreateStation = () => {
        openCreateStationDrawer()
    }

    const handleFollowDev = async () => {
        if (!authState.isAuthenticated || !ndkReady) {
            toast.error('Please log in to follow the developer.')
            return
        }

        const ndk = ndkActions.getNDK()
        if (!ndk || !ndk.signer) {
            toast.error('NDK or signer not available. Cannot follow.')
            return
        }

        let devHexPubKey = ''
        try {
            const decodeResult = nip19.decode(DEV_NPUB)
            if (decodeResult.type === 'npub') {
                devHexPubKey = decodeResult.data
            } else {
                throw new Error('Invalid npub for dev')
            }
        } catch (error) {
            console.error('Error decoding DEV_NPUB:', error)
            toast.error('Could not decode developer public key.')
            return
        }

        if (!devHexPubKey) {
            toast.error('Developer public key is invalid.')
            return
        }

        setIsFollowingDev(true)
        toast.info('Attempting to follow the dev...')

        try {
            const currentUser = await ndk.signer.user()
            const devUserToFollow = ndk.getUser({ pubkey: devHexPubKey })

            await currentUser.follow(devUserToFollow)

            toast.success('Successfully followed the dev!')
        } catch (error) {
            console.error('Error following dev:', error)
            if (error instanceof Error && error.message.toLowerCase().includes('already following')) {
                toast.info('You are already following the dev.')
            } else if (error instanceof Error) {
                toast.error(`Failed to follow dev: ${error.message}`)
            } else {
                toast.error('Failed to follow dev. Unknown error.')
            }
        } finally {
            setIsFollowingDev(false)
        }
    }

    const renderWelcomeCard = () => {
        return (
            <div className="mb-12 p-6 border-2 border-black rounded-lg bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50 shadow-lg mx-auto">
                <div className="flex items-center mb-4">
                    <Info className="h-8 w-8 text-purple-600 mr-3" />
                    <h2 className="text-2xl font-bold text-gray-800">Welcome to Wavefunc!</h2>
                </div>
                <div className="text-gray-600 mb-6 text-md leading-relaxed">
                    <span>
                        Your Nostr-native hub for internet radio. Explore featured stations, log in to customize your
                        experience (
                    </span>
                    <AuthButton
                        compact={true}
                        className="px-1 mx-0.5 font-medium text-purple-600 hover:text-purple-700 inline-flex items-center"
                    />
                    <span>), and dive into the world of decentralized audio!</span>
                </div>
                <h3 className="text-xl font-semibold text-gray-700 mb-3">Get Started:</h3>
                <ul className="space-y-3 mb-8 list-none pl-0">
                    {[
                        { to: '/favourites', icon: Radio, label: 'Create Your Favourite Lists' },
                        { to: '/discover', icon: Headphones, label: 'Discover Stations on Nostr' },
                        { to: '/legacy', icon: Headphones, label: 'Try Our Legacy API Search' },
                    ].map((item) => (
                        <li key={item.to} className="pl-0">
                            <Link to={item.to} className="w-full">
                                <Button
                                    variant="outline"
                                    className="w-full justify-start text-left border-gray-300 hover:border-purple-500 hover:bg-purple-50 text-gray-700"
                                >
                                    <item.icon className="h-5 w-5 mr-3 text-purple-500" /> {item.label}
                                </Button>
                            </Link>
                        </li>
                    ))}
                    <li className="pl-0">
                        <Button
                            variant="outline"
                            className="w-full justify-start text-left border-gray-300 hover:border-purple-500 hover:bg-purple-50 text-gray-700"
                            disabled={!authState.isAuthenticated}
                            onClick={handleCreateStation}
                            title={
                                !authState.isAuthenticated
                                    ? 'Login to create a station'
                                    : 'Bring your own station to Nostr'
                            }
                        >
                            <Plus className="h-5 w-5 mr-3 text-purple-500" /> Bring Your Own Station to Nostr
                        </Button>
                    </li>
                </ul>
                <h3 className="text-xl font-semibold text-gray-700 mb-3">Enjoying Wavefunc?</h3>
                <p className="text-gray-600 mb-4 text-md leading-relaxed">
                    Consider supporting the app and its developer to keep the music playing!
                </p>
                <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3">
                    <Button variant="outline" onClick={() => setIsAppZapDialogOpen(true)} title={'Zap the App!'}>
                        <Zap className={cn('h-5 w-5 mr-2 text-yellow-500')} /> Zap the App
                    </Button>
                    <Button
                        variant="outline"
                        onClick={handleFollowDev}
                        disabled={!authState.isAuthenticated || !ndkReady || isFollowingDev}
                        title={!authState.isAuthenticated ? 'Login to follow' : 'Follow ze dev on Nostr'}
                    >
                        {isFollowingDev ? (
                            <Loader2 className="h-5 w-5 mr-2 text-blue-500 animate-spin" />
                        ) : (
                            <UserPlus className="h-5 w-5 mr-2 text-blue-500" />
                        )}
                        {isFollowingDev ? 'Following...' : 'Follow ze dev'}
                    </Button>
                </div>
            </div>
        )
    }

    const renderFeaturedList = (list: FeaturedList, index: number) => {
        if (!list) return null
        let gridClass = ''
        let title = list.name
        switch (index) {
            case HOMEPAGE_LAYOUT.GRID_2X2:
                gridClass = 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4'
                break
            case HOMEPAGE_LAYOUT.GRID_1X2:
                gridClass = 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4'
                break
            case HOMEPAGE_LAYOUT.GRID_3X2:
                gridClass = 'grid-cols-1 sm:grid-cols-3 lg:grid-cols-3 gap-4'
                break
            default:
                gridClass = 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'
        }
        let stationsToShow = [...list.stations]
        if (index === HOMEPAGE_LAYOUT.GRID_2X2) {
            stationsToShow = stationsToShow.slice(0, 4)
        } else if (index === HOMEPAGE_LAYOUT.GRID_1X2) {
            stationsToShow = stationsToShow.slice(0, 2)
        } else if (index === HOMEPAGE_LAYOUT.GRID_3X2) {
            stationsToShow = stationsToShow.slice(0, 3)
        }

        return (
            <div key={list.id} className="mb-12">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">{title}</h2>
                </div>
                <p className="text-muted-foreground mb-4">{list.description}</p>
                {stationsToShow.length > 0 ? (
                    <div className={`grid ${gridClass}`}>
                        {stationsToShow.map((station) => {
                            const stationData = station as unknown as Station
                            return <RadioCard key={stationData.id} station={stationData} />
                        })}
                    </div>
                ) : (
                    <div className="text-center py-8 border rounded-lg bg-muted/30">
                        <Music className="mx-auto h-12 w-12 text-muted-foreground mb-2" />
                        <p>No stations in this collection</p>
                    </div>
                )}
            </div>
        )
    }

    const shouldShowWelcomeCard = isMobile || loadedFeaturedLists.length > 0

    return (
        <div className="w-full flex flex-col gap-4 my-6 max-w-full">
            <h1 className={cn('font-bold mb-6', isMobile ? 'text-xl' : 'text-2xl md:text-3xl')}>Featured Stations</h1>
            {isLoading ? (
                <div className="flex justify-center items-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="ml-2">Loading featured stations...</span>
                </div>
            ) : hasError ? (
                <div className="space-y-10">
                    {renderWelcomeCard()}
                    <div className="text-center py-12 border rounded-lg bg-muted/30">
                        <Music className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
                        <h2 className="text-xl font-semibold mb-2">Error Loading Featured Stations</h2>
                        <p className="text-muted-foreground">
                            {queryError || 'There was an issue loading featured stations. Please try again later.'}
                        </p>
                    </div>
                </div>
            ) : loadedFeaturedLists.length === 0 ? (
                <div className="space-y-10">
                    {renderWelcomeCard()}
                    <div className="text-center py-12 border rounded-lg bg-muted/30">
                        <Music className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
                        <h2 className="text-xl font-semibold mb-2">No Featured Stations Found</h2>
                        <p className="text-muted-foreground">
                            Could not load the specified featured collections. Check back later!
                        </p>
                    </div>
                </div>
            ) : (
                <div className="space-y-10">
                    {listForLayout1 && renderFeaturedList(listForLayout1, HOMEPAGE_LAYOUT.GRID_2X2)}
                    {shouldShowWelcomeCard && renderWelcomeCard()}
                    {listForLayout2 && renderFeaturedList(listForLayout2, HOMEPAGE_LAYOUT.GRID_1X2)}
                    {listForLayout3 && renderFeaturedList(listForLayout3, HOMEPAGE_LAYOUT.GRID_3X2)}
                </div>
            )}
            {isAppZapDialogOpen && appZapEventForDialog && (
                <ZapDialog
                    isOpen={isAppZapDialogOpen}
                    onOpenChange={setIsAppZapDialogOpen}
                    event={appZapEventForDialog}
                    onZapComplete={() => {
                        toast.success('App zapped successfully!')
                    }}
                />
            )}
        </div>
    )
}
