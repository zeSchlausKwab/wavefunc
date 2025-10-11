import { createFileRoute } from '@tanstack/react-router'
import { StationView } from '../components/StationView'
import { PostView } from '../components/PostView'
import { MusicBrainzSearch } from '../components/MusicBrainzSearch'

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>) => ({
    search: (search.search as string) || '',
  }),
  component: Index,
})

function Index() {
  const { search } = Route.useSearch()

  return (
    <>
      <div className="mt-12">
        <MusicBrainzSearch />
      </div>
      <StationView searchQuery={search} />
      <div className="mt-8">
        <PostView />
      </div>
    </>
  )
}