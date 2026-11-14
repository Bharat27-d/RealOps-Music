import { TextChannel, type Message } from "discord.js";
import type { Player, Track, UnresolvedTrack } from "lavalink-client";
import type { MusicClient } from "./MusicClient.js";
import { createPlayerEmbed } from "../ui/playerEmbed.js";
import { getCustomData, setCustomData } from "../types/index.js";
import { getGuildSettings } from "../utils/guildSettings.js";

export function registerLavalinkEvents(client: MusicClient): void {
  const lavalink = client.lavalink;

  // Track Started
  lavalink.on("trackStart", async (player: Player, track: Track | null) => {
    if (!track || !player.textChannelId) return;

    try {
      const channel = client.channels.cache.get(player.textChannelId) as TextChannel | undefined;
      if (!channel) return;

      const customData = getCustomData(player);

      // Clean up previous now-playing message if it exists
      if (customData.lastMessageId) {
        try {
          const oldMsg = await channel.messages.fetch(customData.lastMessageId).catch(() => null);
          if (oldMsg && oldMsg.deletable) {
            await oldMsg.delete().catch(() => null);
          }
        } catch {
          // Ignore deletion error
        }
      }

      const embedPayload = createPlayerEmbed(player, track);
      const newMsg = await channel.send(embedPayload);
      customData.lastMessageId = newMsg.id;
      setCustomData(player, customData);
    } catch (error) {
      console.error("[Lavalink] Error sending trackStart embed:", error);
    }
  });

  // Track Ended
  lavalink.on("trackEnd", async (player: Player, _track: Track | null) => {
    // If not looping and queue has tracks, next will start automatically
  });

  // Queue Ended
  lavalink.on("queueEnd", async (player: Player, track: Track | UnresolvedTrack | null) => {
    if (!player.textChannelId) return;

    const customData = getCustomData(player);

    // Check if Autoplay is enabled
    if (customData.autoplay && track && "info" in track) {
      try {
        const query = `https://www.youtube.com/watch?v=${track.info.identifier}&list=RD${track.info.identifier}`;
        const res = await player.search({ query, source: "youtube" }, track.requester);
        if (res && res.tracks && res.tracks.length > 1) {
          // Find next track not currently played
          const nextTrack = res.tracks.find((t) => t.info.identifier !== track.info.identifier) || res.tracks[1];
          if (nextTrack) {
            await player.queue.add(nextTrack);
            await player.play();
            return;
          }
        }
      } catch (err) {
        console.warn("[Autoplay] Failed to find recommendation:", err);
      }
    }

    try {
      const channel = client.channels.cache.get(player.textChannelId) as TextChannel | undefined;
      if (channel) {
        await channel.send({
          content: "Queue has ended. Add more tracks with `/play` or enable `/autoplay`.",
        });
      }
    } catch {
      // Ignore channel send error
    }

    // Auto-disconnect if 24/7 mode is not enabled
    const guildSettings = getGuildSettings(player.guildId);
    if (!customData.mode247 && !guildSettings.mode247) {
      setTimeout(async () => {
        const currentPlayer = client.lavalink.getPlayer(player.guildId);
        if (currentPlayer && currentPlayer.queue.tracks.length === 0 && !currentPlayer.playing) {
          const recheckCustom = getCustomData(currentPlayer);
          const recheckSettings = getGuildSettings(player.guildId);
          if (recheckCustom.mode247 || recheckSettings.mode247) return;

          const ch = client.channels.cache.get(currentPlayer.textChannelId || "") as TextChannel | undefined;
          if (ch) {
            await ch.send("Leaving voice channel due to inactivity.").catch(() => null);
          }
          await currentPlayer.destroy("Queue empty timeout");
        }
      }, client.botConfig.player.autoDisconnectIdleSec * 1000);
    }
  });

  // Track Stuck
  lavalink.on("trackStuck", async (player: Player, track: Track | null) => {
    console.warn(`[Lavalink] Track stuck: ${track?.info.title || "Unknown"}`);
    if (player.textChannelId) {
      const channel = client.channels.cache.get(player.textChannelId) as TextChannel | undefined;
      if (channel) {
        await channel.send(`Audio stream got stuck for **${track?.info.title || "Unknown"}**. Skipping to next...`).catch(() => null);
      }
    }
    await player.skip().catch(() => null);
  });

  // Track Error
  lavalink.on("trackError", async (player: Player, track: Track | UnresolvedTrack | null, payload) => {
    console.error(`[Lavalink] Track error:`, payload);
    if (player.textChannelId) {
      const channel = client.channels.cache.get(player.textChannelId) as TextChannel | undefined;
      if (channel) {
        await channel.send(`Failed to play track: **${(track as any)?.info?.title || "Unknown"}**.`).catch(() => null);
      }
    }
    await player.skip().catch(() => null);
  });

  // Player disconnected from Voice Channel
  lavalink.on("playerDisconnect", async (player: Player) => {
    const customData = getCustomData(player);
    const settings = getGuildSettings(player.guildId);
    if (customData.mode247 || settings.mode247) {
      setTimeout(async () => {
        try {
          const targetVc = player.voiceChannelId || settings.voiceChannelId;
          if (targetVc) {
            player.voiceChannelId = targetVc;
            await player.connect();
            console.log(`[24/7] Reconnected to voice channel after disconnect in guild ${player.guildId}`);
          }
        } catch {
          // Reconnect attempt handled
        }
      }, 3000);
    }
  });

  // Node Manager Events
  lavalink.nodeManager.on("connect", (node) => {
    console.log(`✅ [Lavalink Node] Connected to node "${node.id}" (${node.options.host}:${node.options.port})`);
  });

  lavalink.nodeManager.on("error", (node, error) => {
    console.error(`❌ [Lavalink Node] Error on node "${node.id}":`, error.message);
  });

  lavalink.nodeManager.on("disconnect", (node, reason) => {
    console.warn(`⚠️ [Lavalink Node] Disconnected from node "${node.id}":`, reason);
  });

  lavalink.nodeManager.on("reconnecting", (node) => {
    console.log(`🔄 [Lavalink Node] Reconnecting to node "${node.id}"...`);
  });
}
