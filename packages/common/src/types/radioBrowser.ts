export interface RadioStation {
    changeuuid: string
    stationuuid: string
    serveruuid: string
    name: string
    url: string
    url_resolved: string
    homepage: string
    favicon: string
    tags: string
    country: string
    countrycode: string
    iso_3166_2: string
    state: string
    language: string
    languagecodes: string
    votes: number
    lastchangetime: string
    lastchangetime_iso8601: string
    codec: string
    bitrate: number
    hls: number
    lastcheckok: number
    lastchecktime: string
    lastchecktime_iso8601: string
    lastlocalchecktime: string
    lastlocalchecktime_iso8601: string
    clicktimestamp: string
    clicktimestamp_iso8601: string
    clickcount: number
    clicktrend: number
    ssl_error: number
    geo_lat: number | null
    geo_long: number | null
    has_extended_info: boolean
}

// Available endpoints for the Radio Browser API
export type RadioBrowserEndpoint =
    | 'search' // Advanced search
    | 'topclick' // Stations by click count
    | 'byuuid' // Stations by UUID
    | 'byname' // Stations by name
    | 'bycountry' // Stations by country
    | 'bycountrycodes' // Stations by country codes
    | 'bystate' // Stations by state
    | 'bylanguage' // Stations by language
    | 'bytag' // Stations by tag
    | 'bycodec' // Stations by codec
    | 'broken' // Broken stations

// Parameters for Radio Browser API requests
export interface RadioBrowserParams {
    name?: string
    country?: string
    countrycode?: string
    state?: string
    language?: string
    tag?: string
    tagList?: string[]
    codec?: string
    bitrateMin?: number
    bitrateMax?: number
    order?:
        | 'name'
        | 'url'
        | 'homepage'
        | 'favicon'
        | 'tags'
        | 'country'
        | 'state'
        | 'language'
        | 'votes'
        | 'codec'
        | 'bitrate'
        | 'lastcheckok'
        | 'lastchecktime'
        | 'clickcount'
        | 'clicktrend'
        | 'clicktimestamp'
        | 'random'
    reverse?: boolean
    offset?: number
    limit?: number
    hidebroken?: boolean
    uuid?: string
    uuids?: string[]
}

// Configuration for Radio Browser API hooks
export interface UseRadioBrowserConfig {
    endpoint?: RadioBrowserEndpoint
    params?: RadioBrowserParams
    enabled?: boolean
    transformResponse?: boolean
    baseUrl?: string
}
