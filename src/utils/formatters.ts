/**
 * Formats milliseconds into HH:MM:SS or MM:SS
 */
export function formatDuration(ms?: number | null): string {
  if (!ms || isNaN(ms) || ms < 0 || ms === Infinity) return "00:00";

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const paddedSeconds = seconds.toString().padStart(2, "0");
  const paddedMinutes = minutes.toString().padStart(2, "0");

  if (hours > 0) {
    const paddedHours = hours.toString().padStart(2, "0");
    return `${paddedHours}:${paddedMinutes}:${paddedSeconds}`;
  }

  return `${paddedMinutes}:${paddedSeconds}`;
}

/**
 * Parses time strings like "1:30", "01:20:15", "90s", "5m" into milliseconds
 */
export function parseDuration(input: string): number | null {
  const trimmed = input.trim();

  // Handle format: MM:SS or HH:MM:SS
  if (trimmed.includes(":")) {
    const parts = trimmed.split(":").map(Number);
    if (parts.some(isNaN)) return null;

    if (parts.length === 2) {
      const [minutes, seconds] = parts;
      return (minutes * 60 + seconds) * 1000;
    } else if (parts.length === 3) {
      const [hours, minutes, seconds] = parts;
      return (hours * 3600 + minutes * 60 + seconds) * 1000;
    }
    return null;
  }

  // Handle formats like "90s", "5m", "1h"
  const match = trimmed.match(/^(\d+)(s|m|h)?$/i);
  if (match) {
    const value = parseInt(match[1], 10);
    const unit = (match[2] || "s").toLowerCase();
    switch (unit) {
      case "s":
        return value * 1000;
      case "m":
        return value * 60 * 1000;
      case "h":
        return value * 3600 * 1000;
    }
  }

  return null;
}

/**
 * Creates an interactive visual progress bar with an indicator button
 * Example: 🔘────────────────── [01:23 / 03:45]
 */
export function createProgressBar(
  currentMs: number,
  totalMs: number,
  size = 14
): string {
  if (!totalMs || totalMs <= 0 || totalMs === Infinity) {
    return "🔴 Live Stream";
  }

  const progress = Math.min(Math.max(currentMs / totalMs, 0), 1);
  const index = Math.round(size * progress);

  const before = "▬".repeat(Math.max(0, index));
  const after = "─".repeat(Math.max(0, size - index));

  return `${before}🔘${after} \`[${formatDuration(currentMs)} / ${formatDuration(totalMs)}]\``;
}

/**
 * Safely truncates a string to fit embed fields
 */
export function truncate(str?: string | null, maxLen = 45): string {
  if (!str) return "";
  return str.length > maxLen ? `${str.slice(0, maxLen - 3)}...` : str;
}

