import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface SpectrogramProps {
  analyser: AnalyserNode | null;
  isPlaying: boolean;
  color?: string;
  className?: string;
}

const ROWS = 8;
const COLS = 16;

export function Spectrogram({
  analyser,
  isPlaying,
  color = "rgb(0, 219, 233)",
  className,
}: SpectrogramProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | undefined>(undefined);
  const dataRef = useRef<Uint8Array<ArrayBuffer> | undefined>(undefined);
  const peaksRef = useRef<Float32Array>(new Float32Array(COLS));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const drawGrid = (levels: Float32Array, peaks: Float32Array) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width <= 0 || height <= 0) return;
      const targetW = Math.round(width * dpr);
      const targetH = Math.round(height * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const pad = 6;
      const gap = 2;
      const cellW = (width - pad * 2 - gap * (COLS - 1)) / COLS;
      const cellH = (height - pad * 2 - gap * (ROWS - 1)) / ROWS;
      if (cellW <= 0 || cellH <= 0) return;

      for (let col = 0; col < COLS; col++) {
        const level = levels[col] ?? 0;
        const peak = peaks[col] ?? 0;
        const activeRows = Math.round(level * ROWS);
        const peakRow =
          peak > 0.15 ? ROWS - Math.max(1, Math.round(peak * ROWS)) : -1;

        for (let row = 0; row < ROWS; row++) {
          const isActive = row >= ROWS - activeRows;
          const isPeak = isPlaying && row === peakRow && peak > 0.58;
          if (isPeak) {
            ctx.globalAlpha = 0.95;
            ctx.fillStyle = "#B60013";
          } else if (isActive) {
            ctx.globalAlpha = 0.35 + level * 0.65;
            ctx.fillStyle = color;
          } else {
            ctx.globalAlpha = 0.06;
            ctx.fillStyle = color;
          }
          ctx.fillRect(
            pad + col * (cellW + gap),
            pad + row * (cellH + gap),
            cellW,
            cellH,
          );
        }
      }
      ctx.globalAlpha = 1;
    };

    const zeros = new Float32Array(COLS);
    if (!analyser || !isPlaying) {
      peaksRef.current.fill(0);
      drawGrid(zeros, peaksRef.current);
      return;
    }

    const bufferLength = analyser.frequencyBinCount;
    dataRef.current = new Uint8Array(bufferLength);
    const levels = new Float32Array(COLS);

    const tick = () => {
      if (!analyser || !dataRef.current) return;
      analyser.getByteFrequencyData(dataRef.current);
      const data = dataRef.current;

      // Logarithmic bin grouping so bass/mids/treble each get balanced columns.
      const maxBin = Math.max(COLS, Math.floor(data.length * 0.72));
      for (let col = 0; col < COLS; col++) {
        const lo = Math.floor(Math.pow(maxBin, col / COLS));
        const hi = Math.max(lo + 1, Math.floor(Math.pow(maxBin, (col + 1) / COLS)));
        let maxVal = 0;
        for (let i = lo; i < hi && i < data.length; i++) {
          if ((data[i] ?? 0) > maxVal) maxVal = data[i] ?? 0;
        }
        const norm = maxVal / 255;
        levels[col] = norm;
        const prevPeak = peaksRef.current[col] ?? 0;
        peaksRef.current[col] = norm >= prevPeak ? norm : Math.max(norm, prevPeak - 0.025);
      }

      drawGrid(levels, peaksRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };

    tick();
    return () => {
      if (rafRef.current !== undefined) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [analyser, isPlaying, color]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn("absolute inset-0 w-full h-full pointer-events-none", className)}
    />
  );
}
