import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Generate a deterministic color from a string (like a station's d tag)
 * @param str - The string to hash (typically station.dTag or station.id)
 * @param lightnessPercent - How light the color should be (0-100, default 85)
 * @returns CSS HSL color string
 */
export function getDeterministicColor(str: string, lightnessPercent: number = 85): string {
  // Simple hash function to convert string to number
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash; // Convert to 32bit integer
  }

  // Convert hash to hue (0-360 degrees)
  const hue = Math.abs(hash % 360);

  // Use moderate saturation for pleasant colors
  const saturation = 70;

  // Return HSL color
  return `hsl(${hue}, ${saturation}%, ${lightnessPercent}%)`;
}
