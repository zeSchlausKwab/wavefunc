import { useQuery } from '@tanstack/react-query'
import type {
    Station,
    RadioStation,
    RadioBrowserEndpoint,
    RadioBrowserParams,
    UseRadioBrowserConfig,
} from '@wavefunc/common/types'

// Default config
const defaultConfig: UseRadioBrowserConfig = {
    endpoint: 'search',
    params: {
        limit: 100,
        hidebroken: true,
    },
    enabled: false,
    transformResponse: true,
    baseUrl: 'https://de2.api.radio-browser.info/json/stations',
}

/**
 * Transforms the radio stations from the API format to our application format
 */
export function transformToStation(radioStations: RadioStation[]): Station[] {
    const groupedStations = radioStations.reduce(
        (acc, station) => {
            const key = station.name.toLowerCase()
            if (!acc[key]) {
                acc[key] = []
            }
            acc[key].push(station)
            return acc
        },
        {} as Record<string, RadioStation[]>,
    )

    return Object.values(groupedStations).map((stations) => {
        const baseStation = stations[0]

        const allTags = stations
            .map((s) =>
                s.tags
                    .split(',')
                    .map((tag) => tag.trim())
                    .filter(Boolean),
            )
            .flat()
        const uniqueTags = [...new Set(allTags)]

        const uniqueStreams = stations.reduce((acc, s) => {
            const streamUrl = s.url_resolved
            if (!acc.some((existing) => existing.url === streamUrl)) {
                acc.push({
                    url: streamUrl,
                    format: s.codec.toLowerCase(),
                    quality: {
                        bitrate: s.bitrate,
                        codec: s.codec,
                        sampleRate: 44100,
                    },
                    primary: s.bitrate === Math.max(...stations.map((st) => st.bitrate)),
                })
            }
            return acc
        }, [] as any[])

        return {
            id: baseStation.stationuuid,
            name: baseStation.name,
            description: `${baseStation.country} • ${baseStation.language || 'Unknown language'}`,
            website: baseStation.homepage || '',
            genre: uniqueTags.join(', '),
            imageUrl: baseStation.favicon || 'https://picsum.photos/seed/no-station/200/200',
            pubkey: '',
            tags: uniqueTags.map((tag) => [tag]),
            streams: uniqueStreams,
            created_at: new Date(baseStation.lastchangetime_iso8601).getTime() / 1000,
            _originalStations: stations,
        }
    })
}

/**
 * Builds URL search parameters from the config
 */
function buildSearchParams(params: RadioBrowserParams): URLSearchParams {
    const searchParams = new URLSearchParams()

    // Add all params that have values
    Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null) return

        if (key === 'tagList' && Array.isArray(value)) {
            searchParams.append('tag', value.join(','))
        } else if (key === 'uuids' && Array.isArray(value)) {
            searchParams.append('uuids', value.join(','))
        } else if (typeof value === 'boolean') {
            searchParams.append(key, value ? 'true' : 'false')
        } else {
            searchParams.append(key, value.toString())
        }
    })

    return searchParams
}

/**
 * Builds the API URL based on the provided config
 */
function buildApiUrl(config: UseRadioBrowserConfig): string {
    const { endpoint, params, baseUrl } = { ...defaultConfig, ...config }
    const searchParams = params ? buildSearchParams(params) : new URLSearchParams()

    // Special case for UUID endpoint
    if (endpoint === 'byuuid' && params?.uuid) {
        return `${baseUrl}/${endpoint}/${params.uuid}`
    }

    return `${baseUrl}/${endpoint}?${searchParams.toString()}`
}

/**
 * Hook for fetching radio stations from the Radio Browser API
 */
export function useRadioBrowser(config: UseRadioBrowserConfig = {}) {
    const mergedConfig = { ...defaultConfig, ...config }
    const { endpoint, params, enabled, transformResponse } = mergedConfig

    return useQuery({
        queryKey: ['radioBrowser', endpoint, params],
        queryFn: async () => {
            const url = buildApiUrl(mergedConfig)
            const response = await fetch(url)

            if (!response.ok) {
                throw new Error(`Failed to fetch radio stations: ${response.statusText}`)
            }

            const data = (await response.json()) as RadioStation[]

            return transformResponse ? transformToStation(data) : data
        },
        enabled,
    })
}

/**
 * Hook for fetching top clicked radio stations
 */
export function useTopClickedStations(limit = 20, enabled = false) {
    return useRadioBrowser({
        endpoint: 'topclick',
        params: {
            limit,
            hidebroken: true,
        },
        enabled,
    })
}

/**
 * Hook for searching radio stations
 */
export function useSearchStations(searchParams: RadioBrowserParams = {}, enabled = false) {
    return useRadioBrowser({
        endpoint: 'search',
        params: {
            ...searchParams,
            hidebroken: true,
        },
        enabled,
    })
}

/**
 * Hook for fetching radio stations by country
 */
export function useStationsByCountry(countrycode: string, limit = 50, enabled = false) {
    return useRadioBrowser({
        endpoint: 'bycountrycodes',
        params: {
            countrycode,
            limit,
            hidebroken: true,
        },
        enabled,
    })
}

/**
 * Hook for fetching radio stations by tag
 */
export function useStationsByTag(tag: string, limit = 50, enabled = false) {
    return useRadioBrowser({
        endpoint: 'bytag',
        params: {
            tag,
            limit,
            hidebroken: true,
        },
        enabled,
    })
}
