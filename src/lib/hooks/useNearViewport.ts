import { useCallback, useEffect, useState } from "react";

/** Only observed cards own network demand. Cached store values remain available offscreen. */
export function useNearViewport() {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);
  const ref = useCallback((node: HTMLElement | null) => { setElement(node); }, []);
  useEffect(() => {
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const observer = new IntersectionObserver(([entry]) => setVisible(!!entry?.isIntersecting), { rootMargin: "150px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return { ref, visible };
}
