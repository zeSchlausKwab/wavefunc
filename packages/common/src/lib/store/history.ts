import { Store } from '@tanstack/store'
import type { Station } from '@wavefunc/common/src/types/station'

export interface HistoryEntry {
    station: Station
    timestamp: number
    stationCoordinates: string // id:pubkey for uniquely identifying the station
}

export interface HistoryState {
    entries: HistoryEntry[]
    maxEntries: number
}

const STORAGE_KEY = 'wavefunc_player_history'

const initialState: HistoryState = {
    entries: [],
    maxEntries: 50,
}

export const historyStore = new Store<HistoryState>(initialState)

/**
 * Create a serializable copy of a station by removing circular references
 */
const createSerializableStation = (station: Station): Station => {
    // Create a shallow copy of the station object
    const { event, ...serializableStation } = station;
    
    // Return the copy without the event property
    return serializableStation as Station;
};

/**
 * Create a serializable copy of a history entry
 */
const createSerializableEntry = (entry: HistoryEntry): HistoryEntry => {
    return {
        ...entry,
        station: createSerializableStation(entry.station)
    };
};

// Load history from localStorage
export const loadHistory = (): void => {
    try {
        const savedHistory = localStorage.getItem(STORAGE_KEY)
        if (savedHistory) {
            const parsed = JSON.parse(savedHistory)
            historyStore.setState((state) => ({
                ...state,
                entries: parsed.entries || [],
            }))
        }
    } catch (error) {
        console.error('Failed to load history from localStorage:', error)
    }
}

// Save history to localStorage
export const saveHistory = (): void => {
    try {
        const { entries } = historyStore.state
        
        // Create serializable copies of all entries
        const serializableEntries = entries.map(createSerializableEntry);
        
        // Save the serializable entries to localStorage
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ entries: serializableEntries }))
    } catch (error) {
        console.error('Failed to save history to localStorage:', error)
    }
}

// Generate station coordinates
export const getStationCoordinates = (station: Station): string => {
    // Using id and pubkey as they are guaranteed to be in the Station interface
    return `${station.id}:${station.pubkey}`
}

// Add a station to history
export const addToHistory = (station: Station): void => {
    if (!station) return

    const stationCoordinates = getStationCoordinates(station)
    const timestamp = Date.now()

    historyStore.setState((state) => {
        // Remove this station if it already exists in history to avoid duplicates
        const filteredEntries = state.entries.filter(
            (entry) => entry.stationCoordinates !== stationCoordinates
        )

        // Add the new entry at the beginning
        const newEntries = [
            { station, timestamp, stationCoordinates },
            ...filteredEntries,
        ].slice(0, state.maxEntries) // Keep only the max number of entries

        return {
            ...state,
            entries: newEntries,
        }
    })

    // Save to localStorage after updating
    saveHistory()
}

// Get the last played station
export const getLastPlayedStation = (): Station | null => {
    const { entries } = historyStore.state
    return entries.length > 0 ? entries[0].station : null
}

// Clear history
export const clearHistory = (): void => {
    historyStore.setState((state) => ({
        ...state,
        entries: [],
    }))
    saveHistory()
} 