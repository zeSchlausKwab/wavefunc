import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface SpectrogramProps {
  analyser: AnalyserNode | null;
  isPlaying: boolean;
  color?: string;
  className?: string;
}

export function Spectrogram({
  analyser,
  isPlaying,
  color = "rgb(0, 0, 0)",
  className,
}: SpectrogramProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number>();
  const dataArrayRef = useRef<Uint8Array>();

  // Grid dimensions
  const ROWS = 8;
  const COLS = 16;

  useEffect(() => {
    if (!analyser) {
      console.log("Spectrogram: No analyser available");
      return;
    }

    console.log("Spectrogram: Initializing with analyser", { isPlaying, analyser });

    // Initialize frequency data array
    const bufferLength = analyser.frequencyBinCount;
    dataArrayRef.current = new Uint8Array(bufferLength);

    const updateVisualization = () => {
      if (!analyser || !dataArrayRef.current || !gridRef.current || !isPlaying) {
        return;
      }

      // Get frequency data
      analyser.getByteFrequencyData(dataArrayRef.current);

      // Update each cell based on frequency data
      const cells = gridRef.current.querySelectorAll<HTMLDivElement>("[data-cell]");
      const frequencyBinsPerColumn = Math.floor(dataArrayRef.current.length / COLS);

      cells.forEach((cell, index) => {
        const col = index % COLS;
        const row = Math.floor(index / COLS);

        // Get average frequency for this column
        const startBin = col * frequencyBinsPerColumn;
        const endBin = startBin + frequencyBinsPerColumn;
        let sum = 0;
        for (let i = startBin; i < endBin && i < dataArrayRef.current!.length; i++) {
          sum += dataArrayRef.current![i];
        }
        const average = sum / frequencyBinsPerColumn;

        // Normalize to 0-1 range
        const normalized = average / 255;

        // Calculate which rows should be lit based on frequency strength
        const activeRows = Math.floor(normalized * ROWS);
        const isActive = row >= ROWS - activeRows;

        // Set opacity based on whether this cell should be active
        const opacity = isActive ? 0.3 + normalized * 0.7 : 0.05;
        cell.style.opacity = opacity.toString();
      });

      animationFrameRef.current = requestAnimationFrame(updateVisualization);
    };

    if (isPlaying) {
      updateVisualization();
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [analyser, isPlaying]);

  return (
    <div
      ref={gridRef}
      className={cn(
        "absolute inset-0 grid gap-0.5 p-2",
        className
      )}
      style={{
        gridTemplateColumns: `repeat(${COLS}, 1fr)`,
        gridTemplateRows: `repeat(${ROWS}, 1fr)`,
      }}
    >
      {Array.from({ length: ROWS * COLS }).map((_, i) => (
        <div
          key={i}
          data-cell
          className="rounded-sm transition-opacity duration-75"
          style={{
            backgroundColor: color,
            opacity: 0.05,
          }}
        />
      ))}
    </div>
  );
}