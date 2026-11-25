import { defaultParseSearch, defaultStringifySearch } from "@tanstack/react-router";

// Genre names can themselves look like JSON ("90", "true", "[]"). Keep these
// ordinary GET form parameters literal on the server and on in-app navigation.
export function parseRouterSearch(search: string) {
  const parsed: Record<string, unknown> = defaultParseSearch(search);
  const params = new URLSearchParams(search);
  for (const key of ["q", "page"]) {
    const values = params.getAll(key);
    if (values.length) parsed[key] = values.length === 1 ? values[0] : values;
  }
  return parsed;
}

export function stringifyRouterSearch(search: Record<string, unknown>) {
  const { q, page, ...rest } = search;
  const params = new URLSearchParams(defaultStringifySearch(rest));
  for (const [key, value] of Object.entries({ q, page })) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) params.append(key, String(item));
  }
  return params.size ? "?" + params : "";
}
