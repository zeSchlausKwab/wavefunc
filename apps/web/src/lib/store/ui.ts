import { Store } from '@tanstack/store'
import type { Station } from '@wavefunc/common/types/station'

interface UIState {
    stationDrawer: {
        isOpen: boolean
        station: Station | null
    }
}

const initialState: UIState = {
    stationDrawer: {
        isOpen: false,
        station: null,
    },
}

export const uiStore = new Store<UIState>(initialState)

export const openCreateStationDrawer = () => {
    uiStore.setState((state) => ({
        ...state,
        stationDrawer: {
            isOpen: true,
            station: null,
        },
    }))
}

export const openEditStationDrawer = (station: Station) => {
    uiStore.setState((state) => ({
        ...state,
        stationDrawer: {
            isOpen: true,
            station,
        },
    }))
}

export const closeStationDrawer = () => {
    uiStore.setState((state) => ({
        ...state,
        stationDrawer: {
            isOpen: false,
            station: null,
        },
    }))
}
