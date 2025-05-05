import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
    cn,
    getFeaturedListsForHomepage,
    HOMEPAGE_LAYOUT,
    ndkActions,
    type FeaturedList,
    type Station,
} from '@wavefunc/common'
import RadioCard from '@wavefunc/common/src/components/radio/RadioCard'
import { Button } from '@wavefunc/ui/components/ui/button'
import { Loader2, Music } from 'lucide-react'
import { useMedia } from 'react-use'

export const Route = createFileRoute('/')({
    component: Index,
})

function Index() {
    const isMobile = useMedia('(max-width: 640px)')

    // Fetch featured lists for homepage
    const { data: featuredLists, isLoading } = useQuery({
        queryKey: ['featured-lists-homepage'],
        queryFn: async () => {
            const ndk = ndkActions.getNDK()
            if (!ndk) throw new Error('NDK not available')
            return getFeaturedListsForHomepage(ndk, { limit: 3, withStations: true })
        },
        staleTime: 1000 * 60 * 5, // 5 minutes
    })

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
                    <h2 className="text-xl font-semibold mb-2">No Featured Stations</h2>
                    <p className="text-muted-foreground">Check back later for curated station collections</p>
                </div>
            ) : (
                <div className="space-y-10">{featuredLists.map((list, index) => renderFeaturedList(list, index))}</div>
            )}
        </div>
    )
}
