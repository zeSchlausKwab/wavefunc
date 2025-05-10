import { useQuery, useQueries } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import {
    AuthButton,
    authStore,
    cn,
    HOMEPAGE_LAYOUT,
    ndkActions,
    openCreateStationDrawer,
    type FeaturedList,
    type Station,
    getSpecificFeaturedListByDTag,
} from '@wavefunc/common'
import RadioCard from '@wavefunc/common/src/components/radio/RadioCard'
import { getLastPlayedStation, loadHistory } from '@wavefunc/common/src/lib/store/history'
import { setCurrentStation } from '@wavefunc/common/src/lib/store/stations'
import { Button } from '@wavefunc/ui/components/ui/button'
import { Headphones, Loader2, Music, Plus, Radio } from 'lucide-react'
import { useEffect } from 'react'
import { useMedia } from 'react-use'

export const Route = createFileRoute('/')({
    component: Index,
})

const IconWrapper = ({ icon: Icon, className = 'h-5 w-5' }: { icon: any; className?: string }) => {
    return <Icon className={className} />
}

// Define the d-tags for the featured lists you want on the homepage
const APP_PUBKEY = '210f31b6019f5ae13c995c8d83faa41a129f1296842e4c3313ab8a4abb09d1a2'
const homepageFeaturedListDTags = ['psych-alternative-indie', 'drone-ambient', 'electronic']

function Index() {
    const isMobile = useMedia('(max-width: 640px)')
    const authState = useStore(authStore)
    const ndk = ndkActions.getNDK()

    // Load last played station from history
    useEffect(() => {
        loadHistory()
        const lastStation = getLastPlayedStation()
        if (lastStation) {
            // Set as current station but don't start playing
            setCurrentStation(lastStation)
        }
    }, [])

    const featuredListQueries = useQueries({
        queries: homepageFeaturedListDTags.map((dTag) => ({
            queryKey: ['featured-list', dTag],
            queryFn: async () => {
                if (!ndk) throw new Error('NDK not available')
                return getSpecificFeaturedListByDTag(ndk, dTag, APP_PUBKEY, { withStations: true })
            },
            staleTime: 1000 * 60 * 5,
            enabled: !!ndk,
        })),
    })

    const isLoading = featuredListQueries.some((query) => query.isLoading)
    const featuredLists = featuredListQueries
        .map((query) => query.data)
        .filter((list): list is FeaturedList => list !== null)

    const handleCreateStation = () => {
        openCreateStationDrawer()
    }

    const renderWelcomeCard = () => {
        return (
            <div className="mb-12 p-6 border-2 border-black rounded-lg bg-background/50 shadow-sm mx-auto">
                <h2 className="text-xl font-bold mb-4">Welcome to Wavefunc!</h2>

                <div className="text-muted-foreground mb-6 text-md leading-12">
                    <span className="mb-2 block">
                        Your Nostr native place for everything internet radio. After you've checked out the featured
                        stations, and after you've logged in and changed the settings
                        <span className="inline-flex mx-2">
                            <AuthButton compact={true} className="px-1 mx-1 font-medium text-primary inline-flex" />
                        </span>
                        , you can:
                    </span>
                    <span className="mr-2 inline-block">
                        <Link to="/favourites" className="mx-2">
                            <Button variant="default" className="bg-black text-white hover:bg-black/80">
                                <IconWrapper icon={Radio} className="h-5 w-5 mr-3" />
                                create your favourite lists
                            </Button>
                        </Link>
                    </span>
                    <span className="mr-2 inline-block">
                        <Link to="/discover" className="mx-2">
                            <Button variant="default" className="bg-black text-white hover:bg-black/80">
                                <IconWrapper icon={Headphones} className="h-5 w-5 mr-3" />
                                discover radio stations on Nostr
                            </Button>
                        </Link>
                    </span>
                    <span className="mr-2 inline-block">or if you haven't found your station on Nostr, you can</span>
                    <span className="mr-2 inline-block">
                        <Link to="/legacy" className="mx-2">
                            <Button variant="default" className="bg-black text-white hover:bg-black/80">
                                <IconWrapper icon={Headphones} className="h-5 w-5 mr-3" />
                                try our legacy API search
                            </Button>
                        </Link>
                    </span>
                    <span className="mr-2 inline-block">or bring your own favorite station to nostr:</span>
                    <span className="mr-2 inline-block">
                        <Button
                            variant="default"
                            size="icon"
                            className={cn(
                                'bg-green-500 hover:bg-green-600 text-white h-7 w-7 mr-3',
                                'border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]',
                                'transition-transform hover:translate-y-[-2px]',
                            )}
                            disabled={!authState.isAuthenticated}
                            onClick={handleCreateStation}
                        >
                            <IconWrapper icon={Plus} className="h-4 w-4" />
                        </Button>
                    </span>
                </div>
            </div>
        )
    }

    const renderFeaturedList = (list: FeaturedList, index: number) => {
        if (!list) return null

        // Different layouts based on position
        let gridClass = ''
        let title = list.name

        switch (index) {
            case HOMEPAGE_LAYOUT.GRID_2X2: // First list - 2x2 grid (4 stations)
                gridClass = 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4'
                break
            case HOMEPAGE_LAYOUT.GRID_1X2: // Second list - 1x2 grid (2 stations)
                gridClass = 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4'
                break
            case HOMEPAGE_LAYOUT.GRID_3X2: // Third list - 3x1 grid (3 stations)
                gridClass = 'grid-cols-1 sm:grid-cols-3 lg:grid-cols-3 gap-4'
                break
            default:
                gridClass = 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'
        }

        // Limit the number of stations shown based on the layout
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
                            // Cast to FeaturedStation for proper typing
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

    return (
        <div className="w-full flex flex-col gap-4 my-6 max-w-full">
            <h1 className={cn('font-bold mb-6', isMobile ? 'text-xl' : 'text-2xl md:text-3xl')}>Featured Stations</h1>

            {isLoading ? (
                <div className="flex justify-center items-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="ml-2">Loading featured stations...</span>
                </div>
            ) : !featuredLists || featuredLists.length === 0 ? (
                <div className="text-center py-12 border rounded-lg bg-muted/30">
                    <Music className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
                    <h2 className="text-xl font-semibold mb-2">No Featured Stations Found</h2>
                    <p className="text-muted-foreground">
                        Could not load the specified featured collections. Check back later!
                    </p>
                </div>
            ) : (
                <div className="space-y-10">
                    {/* First featured list */}
                    {featuredLists[0] && renderFeaturedList(featuredLists[0], HOMEPAGE_LAYOUT.GRID_2X2)}

                    {/* Welcome card between first and second featured lists */}
                    {featuredLists.length > 0 && renderWelcomeCard()}

                    {/* Rest of the featured lists */}
                    {featuredLists.slice(1).map((list, index) => renderFeaturedList(list, index + 1))}
                </div>
            )}
        </div>
    )
}
