import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

export const GENRE_PAGE_SIZE = 32;

export interface GenreEntry {
  slug: string;
  name: string;
  count: number;
}

function cleanLabel(label: string) {
  return label.trim().replace(/\s+/gu, " ").normalize("NFC");
}

export function genreDisplayName(label: string): string {
  return cleanLabel(label).replace(/^\p{Ll}/u, initial => initial.toUpperCase());
}

/** Spaces become dashes. Escape punctuation (including literal dashes and tildes)
 * so that, for instance, "pop/rock", "pop-rock" and "pop rock" keep distinct URLs. */
export function genreSlug(label: string): string {
  const key = cleanLabel(label).toLowerCase().normalize("NFC");
  if (!key || /[\p{Cc}\p{Cs}]/u.test(key)) return "";
  const slug = key.replace(/[^\p{L}\p{M}\p{N}]/gu, char => {
    if (char === " ") return "-";
    return Array.from(utf8ToBytes(char), byte => "~" + byte.toString(16).padStart(2, "0")).join("");
  });
  // Leave room for the origin, path and page number within the sitemap URL limit.
  return encodeURIComponent(slug).length <= 1900 ? slug : "~h" + bytesToHex(sha256(utf8ToBytes(key)));
}

export function genrePath(slug: string, page = 1): string {
  return "/genre/" + encodeURIComponent(slug) + (page === 1 ? "" : "?page=" + page);
}

export function parseGenrePage(value: unknown): number | undefined {
  if (value === undefined || value === null) return 1;
  if ((typeof value !== "number" && typeof value !== "string") || !/^[1-9]\d*$/.test(String(value))) return;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : undefined;
}

export function stationGenres(tags: string[]): Pick<GenreEntry, "slug" | "name">[] {
  const genres = new Map<string, string>();
  for (const tag of tags) {
    const slug = genreSlug(tag);
    if (slug && !genres.has(slug)) genres.set(slug, genreDisplayName(tag));
  }
  return Array.from(genres, ([slug, name]) => ({ slug, name }));
}

export const GENRE_INDEX_PAGE_SIZE = 100;

export function normalizeGenreQuery(value: unknown): string {
  // A search is a literal substring of a genre label, not a SQL pattern.
  return typeof value === "string" ? Array.from(cleanLabel(value)).slice(0, 128).join("") : "";
}

export function genresPath(page = 1, query = ""): string {
  const search = new URLSearchParams();
  if (query) search.set("q", query);
  if (page !== 1) search.set("page", String(page));
  const params = search.toString();
  return "/browse/genres" + (params ? "?" + params : "");
}
