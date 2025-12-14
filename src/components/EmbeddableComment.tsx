import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * EmbeddableComment (inline embeds)
 * Renders a text comment where each URL becomes a clickable link
 * and its preview (image/video/link) appears right where the link occurs.
 */

export default function EmbeddableComment({
  content,
  allowVideoEmbeds = true,
  className,
}: {
  content: string;
  allowVideoEmbeds?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      <InlineEmbedsText text={content} allowVideoEmbeds={allowVideoEmbeds} />
    </div>
  );
}

function InlineEmbedsText({
  text,
  allowVideoEmbeds,
}: {
  text: string;
  allowVideoEmbeds: boolean;
}) {
  const parts: React.ReactNode[] = [];
  const urlRegex = /(?:(?:https?:)\/\/)[^\s<>'"\)]+/gim;
  let lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = urlRegex.exec(text)) !== null) {
    const match = m[0];
    const start = m.index;
    const end = start + match.length;

    if (lastIndex < start)
      parts.push(
        <span key={`t-${lastIndex}`}>{text.slice(lastIndex, start)}</span>
      );
    const clean = match.replace(/[),.;!?]+$/, "");
    parts.push(
      <LinkWithEmbed
        key={`u-${start}-${end}`}
        url={clean}
        allowVideoEmbeds={allowVideoEmbeds}
      />
    );
    lastIndex = end;
  }

  if (lastIndex < text.length)
    parts.push(<span key={`t-${lastIndex}-end`}>{text.slice(lastIndex)}</span>);
  return (
    <div className="whitespace-pre-wrap break-words leading-relaxed">
      {parts}
    </div>
  );
}

type EmbedKind = "image" | "video" | "link";

interface OGPreview {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  type?: string;
}

const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif"];
const YT_REGEX =
  /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i;
const VIMEO_REGEX = /vimeo\.com\/(\d+)/i;

function hasAnyExt(url: string, exts: string[]) {
  const lower = url.split(/[?#]/)[0].toLowerCase();
  return exts.some((ext) => lower.endsWith(ext));
}
function isLikelyVideoContentType(ct: string) {
  return (
    ct.startsWith("video/") ||
    ct.includes("mpegurl") ||
    ct.includes("dash") ||
    ct.includes("application/x-mpegURL")
  );
}
function detectEmbedKind(
  url: string,
  opts: { allowVideoEmbeds: boolean }
): EmbedKind {
  if (hasAnyExt(url, IMAGE_EXTS)) return "image";
  if (opts.allowVideoEmbeds && (YT_REGEX.test(url) || VIMEO_REGEX.test(url)))
    return "video";
  return "link";
}

function LinkWithEmbed({
  url,
  allowVideoEmbeds,
}: {
  url: string;
  allowVideoEmbeds: boolean;
}) {
  const initialKind = useMemo(
    () => detectEmbedKind(url, { allowVideoEmbeds }),
    [url, allowVideoEmbeds]
  );
  const [kind, setKind] = useState<EmbedKind>(initialKind);
  const [open, setOpen] = useState(true);
  const [ogPreview, setOgPreview] = useState<OGPreview | null>(null);
  const [ogLoading, setOgLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    if (initialKind === "link") {
      (async () => {
        try {
          const res = await fetch(url, { method: "HEAD", signal: ac.signal });
          const ct = res.headers.get("content-type") || "";
          if (ct.startsWith("image/")) {
            setKind("image");
          } else if (allowVideoEmbeds && isLikelyVideoContentType(ct)) {
            setKind("video");
          } else if (ct.includes("text/html")) {
            // Fetch Open Graph preview for HTML pages
            setOgLoading(true);
            try {
              const ogRes = await fetch(
                `/api/og-preview?url=${encodeURIComponent(url)}`,
                { signal: ac.signal }
              );
              if (ogRes.ok) {
                const data = await ogRes.json();
                if (!cancelled && !data.error) {
                  setOgPreview(data);
                }
              }
            } catch (e) {
              // Silent fail for OG preview
            } finally {
              if (!cancelled) setOgLoading(false);
            }
          }
        } catch {}
      })();
    }
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [url, allowVideoEmbeds, initialKind]);

  return (
    <span className="inline">
      <a
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        className="underline underline-offset-2 hover:opacity-80 inline-block max-w-[16rem] truncate align-middle"
        title={url}
      >
        {url}
      </a>
      {(kind !== "link" || ogPreview) && (
        <Button
          variant="ghost"
          size="sm"
          className="ml-1 px-2 py-0 h-6 text-xs align-baseline"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "hide" : "preview"}
        </Button>
      )}
      {open && kind === "image" && <InlineImage url={url} />}
      {open && kind === "video" && allowVideoEmbeds && (
        <InlineVideo url={url} />
      )}
      {open && kind === "link" && ogPreview && !ogLoading && (
        <InlineOGPreview preview={ogPreview} />
      )}
    </span>
  );
}

function InlineImage({ url }: { url: string }) {
  return (
    <figure className="my-2">
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <img
            src={url}
            alt="linked image"
            loading="lazy"
            className="w-full max-h-96 object-contain bg-muted"
          />
        </CardContent>
      </Card>
      <figcaption className="mt-1 text-[11px] text-muted-foreground truncate max-w-full">
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          className="hover:underline"
        >
          {url}
        </a>
      </figcaption>
    </figure>
  );
}

function InlineVideo({ url }: { url: string }) {
  const ytId = (url.match(YT_REGEX) || [])[1];
  const vimeoId = (url.match(VIMEO_REGEX) || [])[1];
  const src = ytId
    ? `https://www.youtube-nocookie.com/embed/${ytId}`
    : vimeoId
    ? `https://player.vimeo.com/video/${vimeoId}`
    : undefined;

  if (!src) return null;

  return (
    <figure className="my-2">
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
            <iframe
              className="absolute inset-0 h-full w-full"
              src={src}
              title="video"
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="no-referrer"
              allowFullScreen
            />
          </div>
        </CardContent>
      </Card>
      <figcaption className="mt-1 text-[11px] text-muted-foreground truncate max-w-full">
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          className="hover:underline"
        >
          {url}
        </a>
      </figcaption>
    </figure>
  );
}

function InlineOGPreview({ preview }: { preview: OGPreview }) {
  return (
    <figure className="my-2">
      <Card className="overflow-hidden hover:border-primary/50 transition-colors">
        <a
          href={preview.url}
          target="_blank"
          rel="noreferrer noopener"
          className="block no-underline"
        >
          {preview.image && (
            <CardContent className="p-0">
              <img
                src={preview.image}
                alt={preview.title || "Preview image"}
                loading="lazy"
                className="w-full max-h-64 object-cover bg-muted"
                onError={(e) => {
                  // Hide image if it fails to load
                  e.currentTarget.style.display = "none";
                }}
              />
            </CardContent>
          )}
          <CardContent className="p-3 space-y-1">
            {preview.siteName && (
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                {preview.siteName}
              </div>
            )}
            {preview.title && (
              <div className="font-semibold text-sm line-clamp-2 text-foreground">
                {preview.title}
              </div>
            )}
            {preview.description && (
              <div className="text-xs text-muted-foreground line-clamp-2">
                {preview.description}
              </div>
            )}
            <div className="text-[10px] text-muted-foreground truncate">
              {new URL(preview.url).hostname}
            </div>
          </CardContent>
        </a>
      </Card>
    </figure>
  );
}
