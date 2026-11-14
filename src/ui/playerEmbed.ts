import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type User,
} from "discord.js";
import type { Player, Track } from "lavalink-client";
import { formatDuration, truncate } from "../utils/formatters.js";
import { getCustomData } from "../types/index.js";

export function createPlayerEmbed(player: Player, track?: Track | null) {
  const current = track || player.queue.current;
  const customData = getCustomData(player);

  if (!current) {
    const emptyEmbed = new EmbedBuilder()
      .setColor(0x2f3136)
      .setDescription("🎵 **Queue is empty.** Use `/play` to listen to music!")
      .setFooter({ text: "RealOps Music" });

    return { embeds: [emptyEmbed], components: [] };
  }

  const requester = (current.requester as User | undefined) || null;
  const duration = current.info.duration || 0;
  const durationText = current.info.isStream ? "🔴 Live" : formatDuration(duration);

  // Active status pills (only shown when enabled, avoiding clutter)
  const statusBadges: string[] = [];
  if (player.repeatMode === "track") statusBadges.push("🔂 Repeat Track");
  if (player.repeatMode === "queue") statusBadges.push("🔁 Repeat Queue");
  if (customData.autoplay) statusBadges.push("📻 Autoplay");
  if (customData.mode247) statusBadges.push("⏰ 24/7");
  if (player.filterManager?.filters.nightcore) statusBadges.push("🌙 Nightcore");
  if (player.filterManager?.filters.vaporwave) statusBadges.push("🌊 Vaporwave");
  if (player.filterManager?.filters.rotation) statusBadges.push("🎧 8D");

  const badgeLine = statusBadges.length > 0 ? `\n\n\`${statusBadges.join(" • ")}\`` : "";

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({ name: "Now Playing" })
    .setTitle(truncate(current.info.title, 60))
    .setURL(current.info.uri || "https://discord.com")
    .setDescription(`by **${truncate(current.info.author, 40)}** • \`${durationText}\`${badgeLine}`)
    .setFooter({
      text: requester ? `Requested by ${requester.username}` : "RealOps Music",
      iconURL: requester ? requester.displayAvatarURL() : undefined,
    });

  if (current.info.artworkUrl) {
    embed.setThumbnail(current.info.artworkUrl);
  }

  // Single clean row of 5 essential controls
  const controls = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("btn_previous")
      .setEmoji("⏮️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(player.queue.previous.length === 0),

    new ButtonBuilder()
      .setCustomId("btn_playpause")
      .setEmoji(player.paused ? "▶️" : "⏸️")
      .setLabel(player.paused ? "Resume" : "Pause")
      .setStyle(player.paused ? ButtonStyle.Success : ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("btn_skip")
      .setEmoji("⏭️")
      .setLabel("Skip")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("btn_loop")
      .setEmoji("🔁")
      .setStyle(player.repeatMode !== "off" ? ButtonStyle.Success : ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("btn_stop")
      .setEmoji("⏹️")
      .setStyle(ButtonStyle.Danger)
  );

  return { embeds: [embed], components: [controls] };
}
