import { Button } from '@wavefunc/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@wavefunc/ui/components/ui/card'
import { Input } from '@wavefunc/ui/components/ui/input'
import { Label } from '@wavefunc/ui/components/ui/label'
import { Database, Loader2 } from 'lucide-react'
import type { SearchType } from './types'

interface LookupFormProps {
    searchType: SearchType
    lookupId: string
    isLoading: boolean
    onSearchTypeChange: (type: SearchType) => void
    onLookupIdChange: (id: string) => void
    onSubmit: () => void
    getToolCost: (toolName: string) => string
}

export function LookupForm({
    searchType,
    lookupId,
    isLoading,
    onSearchTypeChange,
    onLookupIdChange,
    onSubmit,
    getToolCost,
}: LookupFormProps) {
    const searchTypes: { type: SearchType; label: string }[] = [
        { type: 'recording', label: 'Recording' },
        { type: 'release', label: 'Release' },
        { type: 'artist', label: 'Artist' },
        { type: 'label', label: 'Label' },
        { type: 'discogs', label: 'Discogs' },
    ]

    const getToolName = () => {
        switch (searchType) {
            case 'discogs':
                return 'discogs-release'
            case 'recording':
                return 'musicbrainz-get-recording'
            case 'artist':
                return 'musicbrainz-get-artist'
            case 'label':
                return 'musicbrainz-get-label'
            default:
                return 'musicbrainz-get-release'
        }
    }

    const getIdLabel = () => {
        if (searchType === 'discogs') {
            return 'Discogs Release ID'
        }
        return `MusicBrainz ${searchType.charAt(0).toUpperCase() + searchType.slice(1)} ID (MBID)`
    }

    const getPlaceholder = () => {
        if (searchType === 'discogs') {
            return 'e.g., 123456'
        }
        return 'e.g., 5b11f4ce-a62d-471e-81fc-a69a8278c7da'
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Database className="w-5 h-5" />
                    Direct ID Lookup
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Search Type Selector */}
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 mb-4">
                    {searchTypes.map(({ type, label }) => (
                        <Button
                            key={type}
                            variant={searchType === type ? 'default' : 'outline'}
                            onClick={() => onSearchTypeChange(type)}
                            size="sm"
                        >
                            {label}
                        </Button>
                    ))}
                </div>

                {/* ID Input */}
                <div>
                    <Label htmlFor="lookupId">{getIdLabel()}</Label>
                    <Input
                        id="lookupId"
                        value={lookupId}
                        onChange={(e) => onLookupIdChange(e.target.value)}
                        placeholder={getPlaceholder()}
                    />
                </div>

                {/* Submit Button */}
                <Button onClick={onSubmit} disabled={isLoading || !lookupId.trim()} className="w-full">
                    {isLoading ? (
                        <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Looking up...
                        </>
                    ) : (
                        <>
                            <Database className="w-4 h-4 mr-2" />
                            Lookup ({getToolCost(getToolName())})
                        </>
                    )}
                </Button>
            </CardContent>
        </Card>
    )
}
