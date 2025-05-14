import { Store } from '@tanstack/store'
import type { Station } from '@wavefunc/common/src/types/station'

interface UIState {
    stationDrawer: {
        isOpen: boolean
        station: Station | null
    }
    authDialog: {
        isOpen: boolean
        error: string | null
    }
    historyDrawer: {
        isOpen: boolean
    }
}

const initialState: UIState = {
    stationDrawer: {
        isOpen: false,
        station: null,
    },
    authDialog: {
        isOpen: false,
        error: null,
    },
    historyDrawer: {
        isOpen: false,
    },
}

export const uiStore = new Store<UIState>(initialState)

export const uiActions = {
    openAuthDialog: () => {
        uiStore.setState((state) => ({ ...state, authDialog: { isOpen: true, error: null } }))
    },
    closeAuthDialog: () => {
        uiStore.setState((state) => ({ ...state, authDialog: { isOpen: false, error: null } }))
    },
}

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

export const openHistoryDrawer = () => {
    uiStore.setState((state) => ({
        ...state,
        historyDrawer: {
            isOpen: true,
        },
    }))
}

export const closeHistoryDrawer = () => {
    uiStore.setState((state) => ({
        ...state,
        historyDrawer: {
            isOpen: false,
        },
    }))
}
