export interface SpotifyTrackInfo {
  title: string;
  artist: string;
  searchQuery: string;
}

export interface SpotifyResolvedItem {
  type: "track" | "playlist" | "album";
  title: string;
  artist?: string;
  tracks: SpotifyTrackInfo[];
  searchQuery: string;
}

export function isSpotifyUrl(url: string): boolean {
  return /^(https?:\/\/)?(open\.)?spotify\.com\/.*(track|playlist|album)\/[a-zA-Z0-9]+/i.test(url.trim());
}

/**
 * Resolves Spotify track, album, or playlist metadata using Spotify's public Embed API.
 * Bypasses Spotify Developer API restrictions (no Spotify Premium subscription needed).
 */
export async function resolveSpotifyUrl(url: string): Promise<SpotifyResolvedItem | null> {
  const cleanUrl = url.trim();

  // Match track, playlist, or album with optional localization (e.g. intl-es) or user prefixes
  const match = cleanUrl.match(/spotify\.com\/(?:intl-[a-z]+\/)?(?:user\/[a-zA-Z0-9._-]+\/)?(playlist|album|track)\/([a-zA-Z0-9]+)/i);
  if (!match) return null;

  const itemType = match[1].toLowerCase() as "track" | "playlist" | "album";
  const itemId = match[2];

  // For Playlists & Albums, query the Embed page which embeds the full JSON tracklist
  if (itemType === "playlist" || itemType === "album") {
    try {
      const embedUrl = `https://open.spotify.com/embed/${itemType}/${itemId}`;
      const res = await fetch(embedUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });

      if (res.ok) {
        const html = await res.text();
        const jsonMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/i);

        if (jsonMatch && jsonMatch[1]) {
          const data = JSON.parse(jsonMatch[1]);
          const entity = data.props?.pageProps?.state?.data?.entity;

          if (entity && Array.isArray(entity.trackList) && entity.trackList.length > 0) {
            const playlistTitle = entity.name || "Spotify Playlist";
            const tracks: SpotifyTrackInfo[] = entity.trackList.map((t: any) => {
              const songTitle = t.title || "Track";
              const songArtist = (t.subtitle || "").replace(/\u00a0/g, " ").trim();
              return {
                title: songTitle,
                artist: songArtist,
                searchQuery: songArtist ? `${songTitle} ${songArtist}` : songTitle,
              };
            });

            return {
              type: itemType,
              title: playlistTitle,
              tracks,
              searchQuery: tracks[0]?.searchQuery || playlistTitle,
            };
          }
        }
      }
    } catch (err) {
      console.error("[SpotifyResolver] Error parsing playlist/album trackList:", err);
    }
  }

  // Single track fallback / lookup
  try {
    const pageRes = await fetch(cleanUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (pageRes.ok) {
      const html = await pageRes.text();

      // Extract title from <title> tag
      const titleTagMatch = html.match(/<title>(.*?)<\/title>/i);
      if (titleTagMatch && titleTagMatch[1]) {
        const titleTag = titleTagMatch[1].replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec)).trim();
        const parsed = titleTag.match(/^(.*?)\s*-\s*(song|album|playlist|single|compilation)(\s*and\s*lyrics)?\s*by\s*(.*?)\s*\|\s*Spotify/i);
        if (parsed) {
          const title = parsed[1].trim();
          const artist = parsed[4].trim();
          return {
            type: "track",
            title,
            artist,
            tracks: [{ title, artist, searchQuery: `${title} ${artist}` }],
            searchQuery: `${title} ${artist}`,
          };
        }
      }

      // Check OpenGraph
      const ogTitleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["'](.*?)["']/i);
      const ogDescMatch = html.match(/<meta\s+property=["']og:description["']\s+content=["'](.*?)["']/i);

      if (ogTitleMatch && ogTitleMatch[1]) {
        const title = ogTitleMatch[1].trim();
        let artist: string | undefined;

        if (ogDescMatch && ogDescMatch[1]) {
          const parts = ogDescMatch[1].split(/·|•/);
          if (parts.length > 0) {
            const first = parts[0].trim();
            if (!first.toLowerCase().includes("song") && !first.toLowerCase().includes("album")) {
              artist = first;
            }
          }
        }

        const searchQuery = artist ? `${title} ${artist}` : title;
        return {
          type: "track",
          title,
          artist,
          tracks: [{ title, artist: artist || "", searchQuery }],
          searchQuery,
        };
      }
    }
  } catch (err) {
    console.error("[SpotifyResolver] Error resolving single track:", err);
  }

  // Final fallback to oEmbed
  try {
    const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(cleanUrl)}`;
    const res = await fetch(oembedUrl);
    if (res.ok) {
      const data = (await res.json()) as any;
      if (data && data.title) {
        return {
          type: "track",
          title: data.title,
          tracks: [{ title: data.title, artist: "", searchQuery: data.title }],
          searchQuery: data.title,
        };
      }
    }
  } catch {
    // Fallback error
  }

  return null;
}
