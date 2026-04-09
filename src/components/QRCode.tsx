import { useEffect, useState } from "react";
import QRCodeGenerator from "qrcode";

interface QRCodeProps {
  value: string;
  size?: number;
  className?: string;
}

export function QRCode({ value, size = 256, className }: QRCodeProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!value) {
      setDataUrl(null);
      return;
    }
    let cancelled = false;
    QRCodeGenerator.toDataURL(value, {
      width: size,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Failed to generate QR");
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (error) {
    return (
      <div className="text-sm text-destructive text-center p-4">{error}</div>
    );
  }

  if (!dataUrl) {
    return (
      <div
        className={className}
        style={{
          width: size,
          height: size,
          background: "#f0f0f0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span className="text-xs text-muted-foreground">Generating...</span>
      </div>
    );
  }

  return (
    <img
      src={dataUrl}
      alt="QR code"
      width={size}
      height={size}
      className={className}
      style={{ imageRendering: "pixelated" }}
    />
  );
}

interface CopyableQRProps {
  value: string;
  label?: string;
  size?: number;
}

export function CopyableQR({ value, label, size = 240 }: CopyableQRProps) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col items-center space-y-3">
      <div className="bg-white p-2 rounded-lg border">
        <QRCode value={value} size={size} />
      </div>
      <button
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-mono bg-muted hover:bg-muted/70 transition-colors max-w-full"
      >
        <span className="truncate">
          {label || `${value.slice(0, 16)}...${value.slice(-8)}`}
        </span>
        <span className="text-[10px] text-muted-foreground shrink-0">
          {copied ? "copied!" : "click to copy"}
        </span>
      </button>
    </div>
  );
}
