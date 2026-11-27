import { useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { describePublicPage, genericPageMetadata, getPublicMetaTags, getPublicStructuredData, type PublicPage } from "../lib/publicPageMetadata";

const home = { kind: "home" } as const;
const apps = { kind: "apps" } as const;

/** The server writes the initial head. Keep it in sync during client navigation. */
export function PublicPageHead() {
  const page = useRouterState({
    select: (state): PublicPage | null | undefined => {
      const match = state.matches.at(-1);
      if (!match) return undefined;
      switch (match.routeId) {
        case "/": return home;
        case "/apps": return apps;
        case "/station/$naddr":
        case "/collection/$naddr":
        case "/profile/$pubkey":
        case "/browse/genres":
        case "/genre/$slug":
          return match.loaderData;
        default: return null;
      }
    },
  });

  useEffect(() => {
    if (page === undefined) return;
    const metadata = page ? describePublicPage(page) : genericPageMetadata;
    document.title = metadata.title;
    const head = document.head;
    for (const { attribute, key, content } of getPublicMetaTags(metadata)) {
      const existing = head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
      if (existing) {
        if (existing.content !== content) existing.content = content;
      } else {
        const element = document.createElement("meta");
        element.setAttribute(attribute, key);
        element.content = content;
        head.append(element);
      }
    }
    if (metadata.indexable) head.querySelector('meta[name="robots"]')?.remove();
    const canonical = head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (metadata.canonical) {
      if (!canonical) {
        const link = document.createElement("link");
        link.rel = "canonical";
        link.href = metadata.canonical;
        head.append(link);
      } else if (canonical.href !== metadata.canonical) {
        canonical.href = metadata.canonical;
      }
    } else {
      canonical?.remove();
      head.querySelector('meta[property="og:url"]')?.remove();
    }
    const structured = page ? getPublicStructuredData(page) : undefined;
    const existingJsonLd = head.querySelector<HTMLScriptElement>("#wavefunc-structured-data");
    if (structured) {
      const textContent = JSON.stringify(structured);
      if (existingJsonLd) {
        if (existingJsonLd.textContent !== textContent) existingJsonLd.textContent = textContent;
      } else {
        const script = document.createElement("script");
        script.type = "application/ld+json";
        script.id = "wavefunc-structured-data";
        script.textContent = textContent;
        head.append(script);
      }
    } else {
      existingJsonLd?.remove();
    }
  }, [page]);

  return null;
}
