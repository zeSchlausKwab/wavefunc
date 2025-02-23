import { atom } from "jotai";
import { Station } from "@wavefunc/common";

interface StationDrawerState {
  isOpen: boolean;
  station?: Station;
}

export const stationDrawerAtom = atom<StationDrawerState>({
  isOpen: false,
});

export const openCreateStationDrawer = atom(null, (get, set) => {
  set(stationDrawerAtom, { isOpen: true });
});

export const openEditStationDrawer = atom(
  null,
  (get, set, station: Station) => {
    set(stationDrawerAtom, { isOpen: true, station });
  }
);

export const closeStationDrawer = atom(null, (get, set) => {
  set(stationDrawerAtom, { isOpen: false });
});
