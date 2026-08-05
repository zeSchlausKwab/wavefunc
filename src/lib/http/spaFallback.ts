/** True when a missing path is an asset request rather than a client route. */
export function isStaticAssetPath(pathname: string): boolean {
  const segment = pathname.split("/").pop() ?? "";
  return /\.[a-z0-9]{1,12}$/i.test(segment);
}
