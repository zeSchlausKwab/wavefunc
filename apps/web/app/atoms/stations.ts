import { atom } from "jotai";
import { Station, Group } from "@wavefunc/common";

// export const stationsAtom = atom<Station[]>(mockStations);
// export const groupsAtom = atom<Group[]>(mockGroups);
export const currentStationAtom = atom<Station | null>(null);
export const isPlayingAtom = atom<boolean>(false);
