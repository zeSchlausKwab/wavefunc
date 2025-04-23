import { createFileRoute } from '@tanstack/react-router'
import { useParams } from '@tanstack/react-router'
import { Card } from '@wavefunc/ui/components/ui/card'
import { Button } from '@wavefunc/ui/components/ui/button'
import { ArrowLeft } from 'lucide-react'

export const Route = createFileRoute('/station/$naddr')({
    component: StationView,
})

function StationView() {
    // Get the station naddr from the URL parameters
    const { naddr } = useParams({ from: '/station/$naddr' })

    // Here you would fetch the station details based on the naddr
    // This is a simplified version of what would be in the web app

    return (
        <div className="container py-8 max-w-5xl">
            <div className="mb-4">
                <Button variant="ghost" size="sm" asChild className="gap-1">
                    <a href="/">
                        <ArrowLeft className="h-4 w-4" />
                        Back to stations
                    </a>
                </Button>
            </div>

            <Card className="p-6">
                <div className="flex flex-col gap-6">
                    <div className="flex flex-col md:flex-row gap-6">
                        <div className="flex-1">
                            <h1 className="text-3xl font-bold">Station: {naddr}</h1>
                            <p className="text-muted-foreground mt-2">Station details would be loaded here</p>
                        </div>
                    </div>
                </div>
            </Card>
        </div>
    )
}
