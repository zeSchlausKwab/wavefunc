import { Fragment, useMemo, useState } from "react";

const URL_REGEX = /https?:\/\/[^\s<>()]+/gi;

type MediaKind = "video" | "audio" | "image" | "link";

function stripTrailingPunctuation(raw: string): { url: string; trailing: string } {
  let url = raw;
  let trailing = "";
  while (url.length > 0 && /[.,!?;:'")\]]$/.test(url)) {
    trailing = url.slice(-1) + trailing;
    url = url.slice(0, -1);
  }
  return { url, trailing };
}

function classifyUrl(url: string): MediaKind {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    if (/\.(mp4|webm|mov|m4v|ogv)$/.test(path)) return "video";
    if (/\.(mp3|m4a|ogg|wav|flac|opus|aac)$/.test(path)) return "audio";
    if (/\.(jpe?g|png|gif|webp|avif|svg)$/.test(path)) return "image";
    if (
      parsed.hostname.includes("image.nostr.build") ||
      parsed.hostname.includes("i.nostr.build")
    ) {
      return "image";
    }
  } catch {
    // Fall back to link.
  }
  return "link";
}

function InlineImage({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-2 break-all text-xs font-mono"
      >
        {url}
      </a>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block border-2 border-on-background bg-black/5 overflow-hidden max-w-md hover:opacity-95 transition-opacity"
    >
      <img
        src={url}
        alt="Attached media"
        loading="lazy"
        onError={() => setFailed(true)}
        className="max-h-80 w-full object-contain bg-black/10"
      />
    </a>
  );
}

export function RichNoteContent({ content }: { content: string }) {
  const { textParts, videos, audios, images } = useMemo(() => {
    const parts: Array<{ type: "text"; value: string } | { type: "link"; url: string; trailing: string }> = [];
    const vids: string[] = [];
    const auds: string[] = [];
    const imgs: string[] = [];
    const seen = new Set<string>();

    let lastIndex = 0;
    for (const match of content.matchAll(URL_REGEX)) {
      const idx = match.index ?? 0;
      if (idx > lastIndex) {
        parts.push({ type: "text", value: content.slice(lastIndex, idx) });
      }
      const { url, trailing } = stripTrailingPunctuation(match[0]);
      const kind = classifyUrl(url);
      if (kind === "video") {
        if (!seen.has(url)) {
          seen.add(url);
          vids.push(url);
        }
        if (trailing) parts.push({ type: "text", value: trailing });
      } else if (kind === "audio") {
        if (!seen.has(url)) {
          seen.add(url);
          auds.push(url);
        }
        if (trailing) parts.push({ type: "text", value: trailing });
      } else if (kind === "image") {
        if (!seen.has(url)) {
          seen.add(url);
          imgs.push(url);
        }
        if (trailing) parts.push({ type: "text", value: trailing });
      } else {
        parts.push({ type: "link", url, trailing });
      }
      lastIndex = idx + match[0].length;
    }
    if (lastIndex < content.length) {
      parts.push({ type: "text", value: content.slice(lastIndex) });
    }
    return { textParts: parts, videos: vids, audios: auds, images: imgs };
  }, [content]);

  const hasText = textParts.some(
    (p) => (p.type === "link") || p.value.trim().length > 0,
  );

  return (
    <div className="space-y-3">
      {hasText && (
        <p className="text-sm font-medium tracking-tight break-words whitespace-pre-wrap leading-relaxed">
          {textParts.map((part, index) =>
            part.type === "text" ? (
              <Fragment key={index}>{part.value}</Fragment>
            ) : (
              <Fragment key={index}>
                <a
                  href={part.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline decoration-2 underline-offset-2 hover:text-on-background break-all font-mono text-[13px]"
                >
                  {part.url}
                </a>
                {part.trailing}
              </Fragment>
            ),
          )}
        </p>
      )}

      {videos.map((url) => (
        <div
          key={url}
          className="border-2 border-on-background bg-black overflow-hidden max-w-xl"
        >
          <video
            controls
            playsInline
            preload="metadata"
            src={url}
            className="max-h-80 w-full"
          />
          <div className="flex items-center justify-between px-2.5 py-1 bg-on-background text-surface text-[9px] font-black uppercase tracking-widest">
            <span>ATTACHED_VIDEO</span>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-secondary-fixed-dim"
            >
              OPEN_SOURCE
            </a>
          </div>
        </div>
      ))}

      {audios.map((url) => (
        <div
          key={url}
          className="border-2 border-on-background bg-surface-container-low p-2.5 max-w-xl space-y-1.5"
        >
          <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-primary">
            <span>ATTACHED_AUDIO</span>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-on-background"
            >
              OPEN_FILE
            </a>
          </div>
          <audio controls preload="metadata" src={url} className="w-full h-9" />
        </div>
      ))}

      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((url) => (
            <InlineImage key={url} url={url} />
          ))}
        </div>
      )}
    </div>
  );
}
