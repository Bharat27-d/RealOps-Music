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
      .setColor(0x2b2d31)
      .setDescription("Queue is empty. Use `/play` to listen to music.")
      .setFooter({ text: "RealOps Music" });

    return { embeds: [emptyEmbed], components: [] };
  }

  const requester = (current.requester as User | undefined) || null;
  const duration = current.info.duration || 0;
  const durationText = current.info.isStream ? "Live" : formatDuration(duration);

  // Active status pills (clean text, no emojis)
  const statusBadges: string[] = [];
  if (player.repeatMode === "track") statusBadges.push("Loop: Track");
  if (player.repeatMode === "queue") statusBadges.push("Loop: Queue");
  if (customData.autoplay) statusBadges.push("Autoplay: On");
  if (customData.mode247) statusBadges.push("24/7: On");
  if (player.filterManager?.filters.nightcore) statusBadges.push("Filter: Nightcore");
  if (player.filterManager?.filters.vaporwave) statusBadges.push("Filter: Vaporwave");
  if (player.filterManager?.filters.rotation) statusBadges.push("Filter: 8D");

  const badgeLine = statusBadges.length > 0 ? `\n\n\`${statusBadges.join(" • ")}\`` : "";

  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
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

  // Clean, sleek controls without emojis
  const controls = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("btn_previous")
      .setLabel("Previous")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(player.queue.previous.length === 0),

    new ButtonBuilder()
      .setCustomId("btn_playpause")
      .setLabel(player.paused ? "Resume" : "Pause")
      .setStyle(player.paused ? ButtonStyle.Success : ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("btn_skip")
      .setLabel("Skip")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("btn_loop")
      .setLabel(
        player.repeatMode === "track"
          ? "Loop: Track"
          : player.repeatMode === "queue"
          ? "Loop: Queue"
          : "Loop"
      )
      .setStyle(player.repeatMode !== "off" ? ButtonStyle.Success : ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("btn_stop")
      .setLabel("Stop")
      .setStyle(ButtonStyle.Danger)
  );

  return { embeds: [embed], components: [controls] };
}
