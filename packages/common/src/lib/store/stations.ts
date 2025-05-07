import { Store } from '@tanstack/store'
import type { Station, Group } from '@wavefunc/common/src/types/station'

export interface StationsState {
    stations: Station[]
    groups: Group[]
    currentStation: Station | null
    isPlaying: boolean
    currentIndex: number
}

const initialState: StationsState = {
    stations: [],
    groups: [],
    currentStation: null,
    isPlaying: false,
    currentIndex: -1,
}

export const stationsStore = new Store<StationsState>(initialState)

// Actions
export const setStations = (stations: Station[]) => {
    stationsStore.setState((state: StationsState) => ({ ...state, stations }))
}

export const setGroups = (groups: Group[]) => {
    stationsStore.setState((state: StationsState) => ({ ...state, groups }))
}

export const setCurrentStation = (station: Station | null) => {
    stationsStore.setState((state: StationsState) => {
        const currentIndex = station ? state.stations.findIndex((s: Station) => s.id === station.id) : -1
        return {
            ...state,
            currentStation: station,
            currentIndex,
        }
    })
}

/**
 * Sets the current station and ensures playback is started
 */
export const playStation = (station: Station) => {
    stationsStore.setState((state: StationsState) => {
        const currentIndex = station ? state.stations.findIndex((s: Station) => s.id === station.id) : -1
        return {
            ...state,
            currentStation: station,
            currentIndex,
            isPlaying: true, // Always set to playing
        }
    })
}

export const togglePlayback = () => {
    stationsStore.setState((state: StationsState) => ({ ...state, isPlaying: !state.isPlaying }))
}

export const nextStation = () => {
    stationsStore.setState((state: StationsState) => {
        const nextIndex = state.currentIndex + 1
        if (nextIndex < state.stations.length) {
            return {
                ...state,
                currentIndex: nextIndex,
                currentStation: state.stations[nextIndex],
            }
        }
        return state
    })
}

export const previousStation = () => {
    stationsStore.setState((state: StationsState) => {
        const prevIndex = state.currentIndex - 1
        if (prevIndex >= 0) {
            return {
                ...state,
                currentIndex: prevIndex,
                currentStation: state.stations[prevIndex],
            }
        }
        return state
    })
}

// Selectors
export const useCurrentStation = () => stationsStore.state.currentStation
export const useIsPlaying = () => stationsStore.state.isPlaying
export const useHasNext = () => stationsStore.state.currentIndex < stationsStore.state.stations.length - 1
export const useHasPrevious = () => stationsStore.state.currentIndex > 0
