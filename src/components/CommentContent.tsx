import React, { useState } from "react";
import { ExternalLink } from "lucide-react";

interface CommentContentProps {
  content: string;
  className?: string;
}

/**
 * CommentContent parses and renders comment text with:
 * - Clickable links (https://, http://)
 * - Inline images for image URLs
 * - Preserved line breaks
 *
 * Simple implementation without external markdown library
 */
export const CommentContent: React.FC<CommentContentProps> = ({
  content,
  className = "",
}) => {
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  // URL regex pattern
  const urlRegex = /(https?:\/\/[^\s]+)/g;

  // Image URL regex pattern (common extensions)
  const imageRegex = /\.(jpg|jpeg|png|gif|webp|svg)(\?[^\s]*)?$/i;

  const handleImageError = (url: string) => {
    setFailedImages(new Set([...failedImages, url]));
  };

  const isImageUrl = (url: string): boolean => {
    return imageRegex.test(url);
  };

  const parseContent = () => {
    const parts: React.ReactNode[] = [];
    const lines = content.split("\n");

    lines.forEach((line, lineIndex) => {
      const lineParts: React.ReactNode[] = [];
      let lastIndex = 0;

      // Find all URLs in the line
      const matches = Array.from(line.matchAll(urlRegex));

      matches.forEach((match, matchIdx) => {
        const url = match[0];
        const matchIndex = match.index!;

        // Add text before the URL
        if (matchIndex > lastIndex) {
          lineParts.push(
            <span key={`text-${lineIndex}-${lastIndex}`}>
              {line.slice(lastIndex, matchIndex)}
            </span>
          );
        }

        // Check if URL is an image
        if (isImageUrl(url) && !failedImages.has(url)) {
          lineParts.push(
            <React.Fragment key={`img-container-${lineIndex}-${matchIndex}`}>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700 underline inline-flex items-center gap-1 break-all"
              >
                {url.length > 50 ? `${url.slice(0, 47)}...` : url}
                <ExternalLink className="w-3 h-3 flex-shrink-0" />
              </a>
              <div className="my-2">
                <img
                  src={url}
                  alt="Comment image"
                  className="max-w-full max-h-96 rounded-lg border border-gray-200"
                  onError={() => handleImageError(url)}
                  loading="lazy"
                />
              </div>
            </React.Fragment>
          );
        } else {
          // Regular link
          lineParts.push(
            <a
              key={`link-${lineIndex}-${matchIndex}`}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-700 underline inline-flex items-center gap-1 break-all"
            >
              {url.length > 50 ? `${url.slice(0, 47)}...` : url}
              <ExternalLink className="w-3 h-3 flex-shrink-0" />
            </a>
          );
        }

        lastIndex = matchIndex + url.length;
      });

      // Add remaining text after last URL
      if (lastIndex < line.length) {
        lineParts.push(
          <span key={`text-${lineIndex}-${lastIndex}`}>
            {line.slice(lastIndex)}
          </span>
        );
      }

      // If line had no URLs, add the whole line
      if (lineParts.length === 0) {
        lineParts.push(
          <span key={`line-${lineIndex}`}>{line}</span>
        );
      }

      parts.push(
        <div key={`line-container-${lineIndex}`}>
          {lineParts}
        </div>
      );
    });

    return parts;
  };

  return (
    <div className={`whitespace-pre-wrap break-words ${className}`}>
      {parseContent()}
    </div>
  );
};
