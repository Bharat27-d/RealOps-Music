import type { LyricsResult } from "../types/index.js";

function cleanTitle(title: string): string {
  return title
    .replace(/\[.*?\]/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/(official\s*(music)?\s*video|lyric\s*video|audio|visualizer)/gi, "")
    .replace(/ft\..*|feat\..*/gi, "")
    .trim();
}

/**
 * Fetches lyrics from LRCLIB (open source, synced & plain lyrics, no API key required)
 */
export async function fetchLyrics(
  title: string,
  artist?: string,
  durationMs?: number
): Promise<LyricsResult | null> {
  const cleaned = cleanTitle(title);
  const durationSec = durationMs ? Math.round(durationMs / 1000) : undefined;

  // Attempt 1: Exact search with artist and track_name
  if (artist) {
    try {
      const url = new URL("https://lrclib.net/api/get");
      url.searchParams.append("track_name", cleaned);
      url.searchParams.append("artist_name", artist);
      if (durationSec) url.searchParams.append("duration", durationSec.toString());

      const res = await fetch(url.toString(), {
        headers: { "User-Agent": "RealOps-Music-Bot (https://github.com/realops)" },
      });

      if (res.ok) {
        const data = (await res.json()) as any;
        if (data && (data.plainLyrics || data.syncedLyrics)) {
          return {
            title: data.trackName || cleaned,
            artist: data.artistName || artist,
            album: data.albumName,
            plainLyrics: data.plainLyrics || undefined,
            syncedLyrics: data.syncedLyrics || undefined,
          };
        }
      }
    } catch {
      // Fall through to query search
    }
  }

  // Attempt 2: General query search
  try {
    const query = artist ? `${cleaned} ${artist}` : cleaned;
    const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`;
    const res = await fetch(searchUrl, {
      headers: { "User-Agent": "RealOps-Music-Bot (https://github.com/realops)" },
    });

    if (res.ok) {
      const list = (await res.json()) as any[];
      if (Array.isArray(list) && list.length > 0) {
        const item = list[0];
        if (item.plainLyrics || item.syncedLyrics) {
          return {
            title: item.trackName || cleaned,
            artist: item.artistName || "Unknown Artist",
            album: item.albumName,
            plainLyrics: item.plainLyrics || undefined,
            syncedLyrics: item.syncedLyrics || undefined,
          };
        }
      }
    }
  } catch {
    return null;
  }

  return null;
}

