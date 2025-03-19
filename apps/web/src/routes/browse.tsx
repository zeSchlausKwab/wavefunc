import { RadioBrowserSearch } from '../components/radio/RadioBrowserSearch'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/browse')({
    component: Browse,
})

function Browse() {
    return (
        <div className="container mx-auto p-6 space-y-6">
            <h1 className="text-3xl font-bold font-press-start-2p">Browse</h1>
            <RadioBrowserSearch />
        </div>
    )
}
