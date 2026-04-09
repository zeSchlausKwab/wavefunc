import { useEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";
import { Button } from "./ui/button";

interface QRScannerProps {
  onScan: (data: string) => void;
  onClose: () => void;
}

export function QRScanner({ onScan, onClose }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<QrScanner.Camera[]>([]);
  const [cameraId, setCameraId] = useState<string>("");

  useEffect(() => {
    if (!videoRef.current) return;

    let cancelled = false;

    const scanner = new QrScanner(
      videoRef.current,
      (result) => {
        onScan(result.data);
      },
      {
        highlightScanRegion: true,
        highlightCodeOutline: true,
        preferredCamera: "environment",
      }
    );
    scannerRef.current = scanner;

    scanner
      .start()
      .then(async () => {
        if (cancelled) return;
        try {
          const list = await QrScanner.listCameras(true);
          if (!cancelled) {
            setCameras(list);
            // pick back camera as default if available
            const back = list.find((c) =>
              /back|rear|environment/i.test(c.label)
            );
            setCameraId(back?.id || list[0]?.id || "");
          }
        } catch {}
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Scanner start failed:", err);
          setError(
            err?.name === "NotAllowedError"
              ? "Camera permission denied. Allow camera access and try again."
              : err?.message || "Failed to start camera"
          );
        }
      });

    return () => {
      cancelled = true;
      scanner.stop();
      scanner.destroy();
      scannerRef.current = null;
    };
  }, [onScan]);

  // Switch camera
  useEffect(() => {
    if (!cameraId || !scannerRef.current) return;
    scannerRef.current.setCamera(cameraId).catch((err) => {
      console.error("Failed to switch camera:", err);
    });
  }, [cameraId]);

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-lg p-4 w-full max-w-md space-y-3 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Scan QR Code</h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-xl leading-none px-2"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {error ? (
          <div className="space-y-3">
            <div className="text-sm text-destructive bg-destructive/10 rounded-md p-3">
              {error}
            </div>
            <Button
              variant="outline"
              onClick={onClose}
              className="w-full"
            >
              Close
            </Button>
          </div>
        ) : (
          <>
            <div className="relative bg-black rounded-lg overflow-hidden aspect-square">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
                muted
              />
            </div>

            {cameras.length > 1 && (
              <select
                value={cameraId}
                onChange={(e) => setCameraId(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {cameras.map((cam) => (
                  <option key={cam.id} value={cam.id}>
                    {cam.label || cam.id}
                  </option>
                ))}
              </select>
            )}

            <p className="text-xs text-center text-muted-foreground">
              Point the camera at a QR code
            </p>
          </>
        )}
      </div>
    </div>
  );
}
