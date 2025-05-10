import { useQueries } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import {
    AuthButton,
    authStore,
    cn,
    envActions,
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
import { ExternalLink, Headphones, Info, Loader2, Music, Plus, Radio, UserPlus, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useMedia } from 'react-use'
import { toast } from 'sonner'

export const Route = createFileRoute('/')({
    component: Index,
})

const IconWrapper = ({ icon: Icon, className = 'h-5 w-5' }: { icon: any; className?: string }) => {
    return <Icon className={className} />
}

const homepageFeaturedListDTags = ['psych-alternative-indie', 'drone-ambient', 'electronic']
const DEV_NPUB = 'npub182jczunncwe0jn6frpqwq3e0qjws7yqqnc3auccqv9nte2dnd63scjm4rf'

function Index() {
    // Use window.innerWidth as fallback if useMedia hook fails
    const [isMobileWidth, setIsMobileWidth] = useState(() =>
        typeof window !== 'undefined' ? window.innerWidth <= 640 : false,
    )
    // Use the hook as a secondary check
    const isMobileMedia = useMedia('(max-width: 640px)', false)
    const isMobile = isMobileMedia || isMobileWidth

    // Add a resize listener for more reliable mobile detection
    useEffect(() => {
        const handleResize = () => {
            setIsMobileWidth(window.innerWidth <= 640)
        }

        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    const authState = useStore(authStore)
    const ndk = ndkActions.getNDK()
    const env = envActions.getEnv()

    const [isAppZapDialogOpen, setIsAppZapDialogOpen] = useState(false)
    const [canAppReceiveZaps, setCanAppReceiveZaps] = useState<boolean | null>(null)
    const [checkingAppZapCapability, setCheckingAppZapCapability] = useState(false)
    const [appZapEventForDialog, setAppZapEventForDialog] = useState<NDKEvent | null>(null)
    const [queryError, setQueryError] = useState<string | null>(null)

    useEffect(() => {
        loadHistory()
        const lastStation = getLastPlayedStation()
        if (lastStation) {
            setCurrentStation(lastStation)
        }
    }, [])

    // Ensure we have NDK and env initialized
    useEffect(() => {
        // Log the environment variables for debugging
        console.log('Environment loaded:', !!env, 'APP_PUBKEY available:', !!env?.APP_PUBKEY)
        console.log('NDK initialized:', !!ndk)

        if (!ndk) {
            console.error('NDK not initialized, attempting to initialize...')
            try {
                ndkActions.initialize()
                ndkActions.connect()
            } catch (error) {
                console.error('Failed to initialize NDK:', error)
            }
        }

        if (!env) {
            console.error('Environment not initialized, attempting to initialize...')
            try {
                envActions.initialize()
            } catch (error) {
                console.error('Failed to initialize environment:', error)
            }
        }
    }, [ndk, env])

    useEffect(() => {
        if (ndk && env?.APP_PUBKEY) {
            const checkZapCapability = async () => {
                try {
                    setCheckingAppZapCapability(true)
                    const userToZap = ndk.getUser({ pubkey: env.APP_PUBKEY! })
                    const zapInfo = await userToZap.getZapInfo()
                    setCanAppReceiveZaps(zapInfo.size > 0)
                } catch (error) {
                    console.error('Failed to check app zap capability:', error)
                    setCanAppReceiveZaps(false)
                } finally {
                    setCheckingAppZapCapability(false)
                }
            }
            checkZapCapability()

            const tempEvent = new NDKEvent(ndk)
            tempEvent.pubkey = env.APP_PUBKEY!
            tempEvent.content = 'Wavefunc App'
            tempEvent.kind = 0
            setAppZapEventForDialog(tempEvent)
        }
    }, [ndk, env?.APP_PUBKEY])

    const featuredListQueries = useQueries({
        queries: homepageFeaturedListDTags.map((dTag) => ({
            queryKey: ['featured-list', dTag],
            queryFn: async () => {
                if (!ndk) {
                    console.error('NDK not available for featured list query')
                    throw new Error('NDK not available')
                }
                if (!env?.APP_PUBKEY) {
                    console.error('APP_PUBKEY not available for featured list query')
                    throw new Error('APP_PUBKEY not available')
                }

                try {
                    console.log(`Fetching list: ${dTag}`)
                    const result = await getSpecificFeaturedListByDTag(ndk, dTag, env.APP_PUBKEY, {
                        withStations: true,
                    })
                    console.log(`List ${dTag} fetched:`, !!result)
                    return result
                } catch (error) {
                    console.error(`Error fetching list ${dTag}:`, error)
                    throw error
                }
            },
            staleTime: 1000 * 60 * 5,
            enabled: !!ndk && !!env?.APP_PUBKEY,
            // Add longer retry logic for mobile
            retry: 3,
            retryDelay: (attempt: number) => Math.min(attempt > 1 ? 2000 * 2 ** attempt : 1000, 30000),
            onError: (error: Error) => {
                setQueryError(`Failed to load ${dTag}: ${error.message}`)
                console.error(`Query error for ${dTag}:`, error)
            },
        })),
    })

    const isLoading = featuredListQueries.some((query) => query.isLoading)
    const hasError = featuredListQueries.some((query) => query.isError) || queryError !== null

    const listForLayout1 = featuredListQueries[0]?.data ?? null
    const listForLayout2 = featuredListQueries[1]?.data ?? null
    const listForLayout3 = featuredListQueries[2]?.data ?? null
    const loadedFeaturedLists = [listForLayout1, listForLayout2, listForLayout3].filter(Boolean)

    const handleCreateStation = () => {
        openCreateStationDrawer()
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
                    {env?.APP_PUBKEY && appZapEventForDialog && (
                        <Button
                            variant="outline"
                            className="flex-1 justify-center border-yellow-500 hover:border-yellow-600 hover:bg-yellow-50 text-yellow-700 hover:text-yellow-800"
                            onClick={() => setIsAppZapDialogOpen(true)}
                            disabled={checkingAppZapCapability || canAppReceiveZaps === false}
                            title={canAppReceiveZaps === false ? 'App cannot receive zaps currently' : 'Zap the App!'}
                        >
                            <Zap
                                className={cn(
                                    'h-5 w-5 mr-2',
                                    canAppReceiveZaps !== false ? 'text-yellow-500' : 'text-gray-400',
                                )}
                            />{' '}
                            Zap the App
                        </Button>
                    )}
                    <a
                        href={`https://njump.me/${DEV_NPUB}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1"
                    >
                        <Button
                            variant="outline"
                            className="w-full justify-center border-blue-500 hover:border-blue-600 hover:bg-blue-50 text-blue-700 hover:text-blue-800"
                        >
                            <UserPlus className="h-5 w-5 mr-2 text-blue-500" /> Follow ze Dev of zis app
                            <ExternalLink className="h-4 w-4 ml-2 opacity-70" />
                        </Button>
                    </a>
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

        // Show more cards on mobile to ensure content is visible
        let stationsToShow = [...list.stations]
        if (index === HOMEPAGE_LAYOUT.GRID_2X2) {
            stationsToShow = stationsToShow.slice(0, isMobile ? 2 : 4)
        } else if (index === HOMEPAGE_LAYOUT.GRID_1X2) {
            stationsToShow = stationsToShow.slice(0, isMobile ? 1 : 2)
        } else if (index === HOMEPAGE_LAYOUT.GRID_3X2) {
            stationsToShow = stationsToShow.slice(0, isMobile ? 2 : 3)
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

    // Always show welcome card on mobile
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
                // Show the welcome card even on error
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
                // Show welcome card even when no lists are loaded
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

            {isAppZapDialogOpen && appZapEventForDialog && env?.APP_PUBKEY && (
                <ZapDialog
                    isOpen={isAppZapDialogOpen}
                    onOpenChange={setIsAppZapDialogOpen}
                    event={appZapEventForDialog}
                    onZapComplete={(zapEvent: NDKEvent | undefined) => {
                        toast.success('App zapped successfully!')
                    }}
                />
            )}
        </div>
    )
}
