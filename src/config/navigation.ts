export type NavigationSurface = "desktop" | "mobile" | "desktop-action";

export type NavigationBadge = "station-favorites" | "song-favorites";

export interface AppNavigationItem {
  to: string;
  label: string;
  icon: string;
  surfaces: readonly NavigationSurface[];
  adminOnly?: boolean;
  badge?: NavigationBadge;
}

/**
 * Canonical app navigation. Keeping route metadata here prevents the desktop
 * header and mobile sidebar from silently drifting apart as destinations are
 * added or renamed.
 */
export const APP_NAVIGATION_ITEMS: readonly AppNavigationItem[] = [
  { to: "/", label: "TRANSMIT", icon: "home", surfaces: ["desktop", "mobile"] },
  {
    to: "/browse/genres",
    label: "RECEPTION",
    icon: "music_note",
    surfaces: ["desktop", "mobile"],
  },
  {
    to: "/musicbrainz",
    label: "LOOKUP",
    icon: "manage_search",
    surfaces: ["desktop", "mobile"],
  },
  {
    to: "/favorites",
    label: "ARCHIVE",
    icon: "star",
    surfaces: ["desktop", "mobile"],
    badge: "station-favorites",
  },
  {
    to: "/crate",
    label: "CRATE",
    icon: "album",
    surfaces: ["desktop", "mobile"],
    badge: "song-favorites",
  },
  {
    to: "/signals",
    label: "SIGNALS",
    icon: "graphic_eq",
    surfaces: ["desktop", "mobile"],
  },
  {
    to: "/community",
    label: "ASSEMBLY",
    icon: "forum",
    surfaces: ["desktop", "mobile"],
  },
  {
    to: "/admin",
    label: "CONTROL",
    icon: "admin_panel_settings",
    surfaces: ["desktop"],
    adminOnly: true,
  },
  {
    to: "/apps",
    label: "DOWNLOAD",
    icon: "download",
    surfaces: ["mobile", "desktop-action"],
  },
] as const;

export function getNavigationItems(
  surface: NavigationSurface,
  isAdminUser = false,
): readonly AppNavigationItem[] {
  return APP_NAVIGATION_ITEMS.filter(
    (item) =>
      item.surfaces.includes(surface) && (!item.adminOnly || isAdminUser),
  );
}
