import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type GuildMember,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import type { Player, Track, UnresolvedTrack, SearchPlatform } from "lavalink-client";
import type { MusicClient } from "../structures/MusicClient.js";
import type { Command } from "../types/index.js";
import { getCustomData, setCustomData } from "../types/index.js";
import { formatDuration, truncate } from "../utils/formatters.js";
import { isSpotifyUrl, resolveSpotifyUrl } from "../utils/spotifyResolver.js";
import { getGuildSettings } from "../utils/guildSettings.js";

/**
 * Fetches video title via YouTube public oEmbed API when direct playback is blocked.
 */
async function fetchYoutubeOembedTitle(url: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    if (res.ok) {
      const data = (await res.json()) as any;
      return data.title || null;
    }
  } catch {}
  return null;
}

/**
 * Searches for a single track across YouTube Music, YouTube, and SoundCloud.
 * Filters out long compilation mixes (>15m) when normal song-length tracks exist.
 */
async function searchBestTrack(
  player: Player,
  query: string,
  requester: any,
  preferSource?: string
): Promise<Track | UnresolvedTrack | null> {
  const sources = preferSource
    ? [preferSource, "ytmsearch", "ytsearch", "scsearch"]
    : ["ytmsearch", "ytsearch", "scsearch"];

  const triedSources = new Set<string>();

  for (const src of sources) {
    if (triedSources.has(src)) continue;
    triedSources.add(src);

    try {
      const res = await player.search({ query, source: src as SearchPlatform }, requester);
      if (res && res.tracks && res.tracks.length > 0) {
        // If multiple tracks returned, prefer one with standard song duration (30s to 15m)
        if (res.tracks.length > 1) {
          const normalTrack = res.tracks.find(
            (t) => (t.info?.duration || 0) >= 30_000 && (t.info?.duration || 0) <= 900_000
          );
          if (normalTrack) return normalTrack;
        }
        return res.tracks[0];
      }
    } catch {
      // try next source
    }
  }

  return null;
}

export const playCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Play a track, playlist, or stream from any platform (Spotify, YouTube, SoundCloud, etc.)")
    .addStringOption((opt) =>
      opt
        .setName("query")
        .setDescription("Song name, artist, or URL (Spotify, YouTube, SoundCloud, Apple Music, etc.)")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("source")
        .setDescription("Search platform (default: YouTube Music)")
        .setRequired(false)
        .addChoices(
          { name: "YouTube Music", value: "ytmsearch" },
          { name: "YouTube", value: "ytsearch" },
          { name: "SoundCloud", value: "scsearch" }
        )
    ),

  async execute(interaction: ChatInputCommandInteraction, client: MusicClient) {
    const member = interaction.member as GuildMember;
    const voiceChannel = member?.voice?.channel;

    if (!voiceChannel) {
      await interaction.reply({
        content: "You need to be in a voice channel to play music.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const permissions = voiceChannel.permissionsFor(interaction.client.user);
    if (!permissions?.has("Connect") || !permissions?.has("Speak")) {
      await interaction.reply({
        content: "I do not have permission to connect and speak in your voice channel.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply();

    const hasConnectedNode = [...client.lavalink.nodeManager.nodes.values()].some((n) => n.connected);
    if (!hasConnectedNode) {
      await interaction.editReply({
        content: "Audio node is currently connecting to Lavalink. Please try again in a few seconds.",
      });
      return;
    }

    const rawQuery = interaction.options.getString("query", true).trim();
    const sourceOption = interaction.options.getString("source");
    const defaultSource = sourceOption || client.botConfig.player.defaultSearchPlatform;

    // Retrieve or create player
    let player = client.lavalink.getPlayer(interaction.guildId!);
    if (!player) {
      player = client.lavalink.createPlayer({
        guildId: interaction.guildId!,
        voiceChannelId: voiceChannel.id,
        textChannelId: interaction.channelId,
        selfDeaf: true,
        volume: client.botConfig.player.defaultVolume,
        instaUpdateFiltersFix: true,
      });

      const settings = getGuildSettings(interaction.guildId!);
      if (settings.mode247) {
        const customData = getCustomData(player);
        customData.mode247 = true;
        setCustomData(player, customData);
      }
    }

    // Connect if not already in voice
    if (!player.connected) {
      await player.connect();
    }

    // ─────────────────────────────────────────────────────────────
    // 1. SPOTIFY URL RESOLUTION (Single Track, Album, or Playlist)
    // ─────────────────────────────────────────────────────────────
    if (isSpotifyUrl(rawQuery)) {
      const spotifyData = await resolveSpotifyUrl(rawQuery);

      if (spotifyData) {
        // Multi-track Spotify playlist or album
        if (
          (spotifyData.type === "playlist" || spotifyData.type === "album") &&
          spotifyData.tracks.length > 0
        ) {
          const totalTracks = spotifyData.tracks.length;
          const firstItem = spotifyData.tracks[0];

          // 1. Resolve first song immediately so music starts playing without delay
          const firstTrack = await searchBestTrack(player, firstItem.searchQuery, interaction.user);

          if (!firstTrack) {
            await interaction.editReply({
              content: `Could not resolve tracks from Spotify ${spotifyData.type}: \`${truncate(spotifyData.title, 50)}\`.`,
            });
            return;
          }

          await player.queue.add(firstTrack);
          if (!player.playing) {
            await player.play();
          }

          if (totalTracks === 1) {
            // Only 1 song in playlist
            await interaction.editReply({
              content: `Queued **${truncate(firstTrack.info.title, 50)}** from Spotify.`,
            });
            return;
          }

          // Initial confirmation embed to Discord
          const loadingEmbed = new EmbedBuilder()
            .setColor(0x2b2d31)
            .setTitle(`Loading Spotify ${spotifyData.type === "album" ? "Album" : "Playlist"}`)
            .setDescription(
              `Found **${totalTracks} tracks** in **[${truncate(spotifyData.title, 50)}](${rawQuery})**\n\n` +
              `Playing first: [${truncate(firstTrack.info.title, 45)}](${firstTrack.info.uri})\n` +
              `Queuing remaining **${totalTracks - 1} tracks** in background...`
            )
            .setFooter({ text: `Requested by ${interaction.user.username}` })
            .setTimestamp();

          await interaction.editReply({ embeds: [loadingEmbed] });

          // Background loader: fetch remaining tracks in batches
          (async () => {
            let loadedCount = 1;
            const remaining = spotifyData.tracks.slice(1);
            const batchSize = 4;

            for (let i = 0; i < remaining.length; i += batchSize) {
              if (!player.connected) break;

              const batch = remaining.slice(i, i + batchSize);
              const batchResults = await Promise.all(
                batch.map((t) => searchBestTrack(player, t.searchQuery, interaction.user))
              );

              const validTracks = batchResults.filter((t): t is (Track | UnresolvedTrack) => !!t);
              if (validTracks.length > 0) {
                await player.queue.add(validTracks);
                loadedCount += validTracks.length;
              }

              // Polite throttle between batches
              await new Promise((r) => setTimeout(r, 120));
            }

            const doneEmbed = new EmbedBuilder()
              .setColor(0x2b2d31)
              .setTitle(`Spotify ${spotifyData.type === "album" ? "Album" : "Playlist"} Added`)
              .setDescription(
                `Successfully loaded **${loadedCount} tracks** from **[${truncate(spotifyData.title, 50)}](${rawQuery})** to the queue.\n\n` +
                `Use \`/queue\` to see all tracks or \`/shuffle\` to randomize.`
              )
              .setFooter({ text: `Requested by ${interaction.user.username}` })
              .setTimestamp();

            await interaction.editReply({ embeds: [doneEmbed] }).catch(() => null);
          })();

          return;
        }

        // Single Spotify track
        const singleTrack = await searchBestTrack(player, spotifyData.searchQuery, interaction.user);
        if (!singleTrack) {
          await interaction.editReply({
            content: `Could not find track \`${truncate(spotifyData.title, 50)}\` on YouTube/SoundCloud.`,
          });
          return;
        }

        await player.queue.add(singleTrack);
        if (!player.playing) {
          await player.play();
          await interaction.editReply({ content: `Now playing **${truncate(singleTrack.info.title, 50)}**.` });
        } else {
          const embed = new EmbedBuilder()
            .setColor(0x2b2d31)
            .setTitle("Added to Queue")
            .setDescription(`[${truncate(singleTrack.info.title, 55)}](${singleTrack.info.uri})\nBy **${truncate(singleTrack.info.author, 40)}**`)
            .addFields(
              { name: "Duration", value: `\`${formatDuration(singleTrack.info.duration)}\``, inline: true },
              { name: "Position in Queue", value: `\`#${player.queue.tracks.length}\``, inline: true }
            )
            .setThumbnail(singleTrack.info.artworkUrl || null)
            .setFooter({ text: `Requested by ${interaction.user.username}` });

          await interaction.editReply({ embeds: [embed] });
        }
        return;
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 2. YOUTUBE PLAYLIST URL (with ?list= or /playlist?list=)
    // ─────────────────────────────────────────────────────────────
    let searchQuery = rawQuery;
    let isUrl = rawQuery.startsWith("http://") || rawQuery.startsWith("https://");

    // If it's a YouTube watch link with a playlist ID (e.g. watch?v=...&list=PL...), prioritize the playlist
    const ytListMatch = rawQuery.match(/[?&]list=([a-zA-Z0-9_-]+)/i);
    if (isUrl && (rawQuery.includes("youtube.com") || rawQuery.includes("youtu.be")) && ytListMatch) {
      const playlistId = ytListMatch[1];
      if (!playlistId.startsWith("RD")) {
        // Try resolving full playlist first
        const playlistUrl = `https://www.youtube.com/playlist?list=${playlistId}`;
        const plRes = await player.search({ query: playlistUrl }, interaction.user).catch(() => null);
        if (plRes && plRes.loadType === "playlist" && plRes.tracks?.length > 0) {
          await player.queue.add(plRes.tracks);
          if (!player.playing) await player.play();

          const playlistName = plRes.playlist?.name || "YouTube Playlist";
          const totalDuration = plRes.tracks.reduce((acc, t) => acc + (t.info?.duration || 0), 0);

          const embed = new EmbedBuilder()
            .setColor(0x2b2d31)
            .setTitle("Added Playlist to Queue")
            .setDescription(
              `Added **${plRes.tracks.length} tracks** from **[${truncate(playlistName, 50)}](${rawQuery})**\n` +
              `Total Duration: \`${formatDuration(totalDuration)}\``
            )
            .setFooter({ text: `Requested by ${interaction.user.username}` })
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
          return;
        }
      }
    }

    // Strip tracking parameters from YouTube URLs
    if (isUrl && (searchQuery.includes("youtube.com") || searchQuery.includes("youtu.be"))) {
      try {
        const parsed = new URL(searchQuery);
        parsed.searchParams.delete("si");
        parsed.searchParams.delete("feature");
        searchQuery = parsed.toString();
      } catch {}
    }

    // ─────────────────────────────────────────────────────────────
    // 3. STANDARD SEARCH (Direct URL or Keyword Search)
    // ─────────────────────────────────────────────────────────────
    let res = await player.search(
      {
        query: searchQuery,
        source: isUrl ? undefined : (defaultSource as SearchPlatform),
      },
      interaction.user
    ).catch((err) => {
      console.warn("[Play] Primary search failed:", err);
      return null;
    });

    // Fallback 1: If YouTube direct link fails (e.g. datacenter block, login required),
    // resolve the title via oEmbed and re-search by keyword — keyword search uses a different
    // YouTube code path and benefits from IPv6 rotation, avoiding direct video-ID blocks.
    if (isUrl && (!res || !res.tracks || res.tracks.length === 0)) {
      if (rawQuery.includes("youtube.com") || rawQuery.includes("youtu.be")) {
        console.log(`[Play] YouTube direct load failed. Resolving title via oEmbed...`);
        const title = await fetchYoutubeOembedTitle(rawQuery);
        if (title) {
          console.log(`[Play] oEmbed title: "${title}". Re-searching via ytmsearch → ytsearch → scsearch...`);
          // Try ytmsearch first (keyword lookup goes through a different YouTube path)
          res = await player.search({ query: title, source: "ytmsearch" }, interaction.user).catch(() => null);
          // If ytmsearch also fails, try ytsearch
          if (!res || !res.tracks || res.tracks.length === 0) {
            res = await player.search({ query: title, source: "ytsearch" }, interaction.user).catch(() => null);
          }
          // Last resort: SoundCloud
          if (!res || !res.tracks || res.tracks.length === 0) {
            res = await player.search({ query: title, source: "scsearch" }, interaction.user).catch(() => null);
          }
        }
      }
    }

    // Fallback 2: If keyword search returned 0 tracks, try other sources
    if (!res || !res.tracks || res.tracks.length === 0) {
      if (!isUrl) {
        // Try the sources we haven't tried yet, in order of reliability
        const fallbackSources = ["ytmsearch", "ytsearch", "scsearch"].filter(
          (s) => s !== defaultSource
        ) as SearchPlatform[];
        for (const src of fallbackSources) {
          console.log(`[Play] Trying fallback source "${src}" for "${searchQuery}"`);
          res = await player.search({ query: searchQuery, source: src }, interaction.user).catch(() => null);
          if (res && res.tracks && res.tracks.length > 0) break;
        }
      }
    }

    if (!res || !res.tracks || res.tracks.length === 0) {
      await interaction.editReply({
        content: `No results found for \`${truncate(rawQuery, 50)}\`.`,
      });
      return;
    }

    // Lavalink native playlist
    if (res.loadType === "playlist") {
      await player.queue.add(res.tracks);
      if (!player.playing) await player.play();

      const playlistName = res.playlist?.name || "Playlist";
      const totalDuration = res.tracks.reduce((acc, t) => acc + (t.info?.duration || 0), 0);

      const embed = new EmbedBuilder()
        .setColor(0x2b2d31)
        .setTitle("Added Playlist to Queue")
        .setDescription(
          `Added **${res.tracks.length} tracks** from **[${truncate(playlistName, 50)}](${rawQuery})**\n` +
          `Total Duration: \`${formatDuration(totalDuration)}\``
        )
        .setFooter({ text: `Requested by ${interaction.user.username}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Single track result: pick best match (avoid long DJ mixes when a regular song exists)
    let track = res.tracks[0];
    if (res.tracks.length > 1 && !isUrl) {
      const normalTrack = res.tracks.find(
        (t) => (t.info?.duration || 0) >= 30_000 && (t.info?.duration || 0) <= 900_000
      );
      if (normalTrack) track = normalTrack;
    }

    await player.queue.add(track);

    if (player.playing) {
      const embed = new EmbedBuilder()
        .setColor(0x2b2d31)
        .setTitle("Added to Queue")
        .setDescription(`[${truncate(track.info.title, 55)}](${track.info.uri})\nBy **${truncate(track.info.author, 40)}**`)
        .addFields(
          { name: "Duration", value: `\`${formatDuration(track.info.duration)}\``, inline: true },
          { name: "Position in Queue", value: `\`#${player.queue.tracks.length}\``, inline: true }
        )
        .setThumbnail(track.info.artworkUrl || null)
        .setFooter({ text: `Requested by ${interaction.user.username}` });

      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.editReply({ content: `Now playing **${truncate(track.info.title, 50)}**.` });
      await player.play();
    }
  },
};
