import {
  type ButtonInteraction,
  EmbedBuilder,
  type GuildMember,
  MessageFlags,
} from "discord.js";
import type { MusicClient } from "../structures/MusicClient.js";
import { createPlayerEmbed } from "../ui/playerEmbed.js";
import { fetchLyrics } from "../utils/lyrics.js";
import { formatDuration, truncate } from "../utils/formatters.js";

export async function handleButtonInteraction(
  interaction: ButtonInteraction,
  client: MusicClient
): Promise<void> {
  const { guildId, member, customId } = interaction;
  if (!guildId || !member) return;

  const guildMember = member as GuildMember;
  const player = client.lavalink.getPlayer(guildId);

  // If player doesn't exist, remove components or inform user
  if (!player) {
    await interaction.reply({
      content: "❌ There is no active music session in this server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Voice channel check
  const memberVc = guildMember.voice.channelId;
  const botVc = player.voiceChannelId;

  if (!memberVc || memberVc !== botVc) {
    await interaction.reply({
      content: "❌ You must be in the same voice channel as the bot to use player controls.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    switch (customId) {
      case "btn_playpause": {
        if (player.paused) {
          await player.resume();
          await interaction.reply({ content: "▶️ Resumed playback.", flags: MessageFlags.Ephemeral });
        } else {
          await player.pause();
          await interaction.reply({ content: "⏸️ Paused playback.", flags: MessageFlags.Ephemeral });
        }
        // Update now playing embed
        const payload = createPlayerEmbed(player);
        await interaction.message.edit(payload).catch(() => null);
        break;
      }

      case "btn_skip": {
        const currentTitle = player.queue.current?.info.title || "Track";
        if (player.queue.tracks.length > 0) {
          await player.skip(0, false);
          await interaction.reply({
            content: `⏭️ Skipped **${truncate(currentTitle, 40)}**.`,
            flags: MessageFlags.Ephemeral,
          });
        } else {
          await player.stopPlaying(true, false);
          await interaction.reply({
            content: `⏭️ Skipped **${truncate(currentTitle, 40)}**. (Queue is now empty)`,
            flags: MessageFlags.Ephemeral,
          });
        }
        break;
      }

      case "btn_previous": {
        if (player.queue.previous.length === 0) {
          await interaction.reply({
            content: "⚠️ No previous track available in history.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const prev = await player.queue.shiftPrevious();
        if (prev) {
          await player.queue.add(prev, 0);
          await player.skip(0, false);
          await interaction.reply({
            content: `⏮️ Playing previous track: **${truncate(prev.info.title, 40)}**.`,
            flags: MessageFlags.Ephemeral,
          });
        }
        break;
      }

      case "btn_stop": {
        player.queue.tracks.splice(0, player.queue.tracks.length);
        await player.stopPlaying(true, false);
        await interaction.reply({ content: "⏹️ Playback stopped and queue cleared." });
        break;
      }

      case "btn_loop": {
        let nextMode: "off" | "track" | "queue" = "off";
        if (player.repeatMode === "off") nextMode = "track";
        else if (player.repeatMode === "track") nextMode = "queue";
        else nextMode = "off";

        await player.setRepeatMode(nextMode);

        const modeLabels = {
          off: "Disabled",
          track: "🔂 Single Track",
          queue: "🔁 Whole Queue",
        };

        await interaction.reply({
          content: `🔁 Loop mode set to: **${modeLabels[nextMode]}**.`,
          flags: MessageFlags.Ephemeral,
        });

        const payload = createPlayerEmbed(player);
        await interaction.message.edit(payload).catch(() => null);
        break;
      }

      case "btn_shuffle": {
        if (player.queue.tracks.length <= 1) {
          await interaction.reply({
            content: "⚠️ Not enough tracks in queue to shuffle.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        await player.queue.shuffle();
        await interaction.reply({
          content: `🔀 Shuffled **${player.queue.tracks.length}** songs in queue!`,
          flags: MessageFlags.Ephemeral,
        });
        break;
      }

      case "btn_volumedown": {
        const currentVol = player.volume;
        const newVol = Math.max(10, currentVol - 10);
        await player.setVolume(newVol);
        await interaction.reply({
          content: `🔉 Volume lowered to **${newVol}%**.`,
          flags: MessageFlags.Ephemeral,
        });

        const payload = createPlayerEmbed(player);
        await interaction.message.edit(payload).catch(() => null);
        break;
      }

      case "btn_volumeup": {
        const currentVol = player.volume;
        const newVol = Math.min(200, currentVol + 10);
        await player.setVolume(newVol);
        await interaction.reply({
          content: `🔊 Volume raised to **${newVol}%**.`,
          flags: MessageFlags.Ephemeral,
        });

        const payload = createPlayerEmbed(player);
        await interaction.message.edit(payload).catch(() => null);
        break;
      }

      case "btn_lyrics": {
        const current = player.queue.current;
        if (!current) {
          await interaction.reply({ content: "⚠️ No track is playing.", flags: MessageFlags.Ephemeral });
          return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const lyrics = await fetchLyrics(
          current.info.title,
          current.info.author,
          current.info.duration
        );

        if (!lyrics || (!lyrics.plainLyrics && !lyrics.syncedLyrics)) {
          await interaction.editReply({
            content: `❌ No lyrics found for **${truncate(current.info.title, 40)}**.`,
          });
          return;
        }

        const rawText = lyrics.plainLyrics || lyrics.syncedLyrics || "";
        const lines = rawText.slice(0, 3900);

        const lyricsEmbed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`📜 Lyrics: ${truncate(lyrics.title, 40)} - ${truncate(lyrics.artist, 30)}`)
          .setDescription(lines)
          .setFooter({ text: "Lyrics powered by LRCLIB" })
          .setTimestamp();

        await interaction.editReply({ embeds: [lyricsEmbed] });
        break;
      }

      case "btn_queue": {
        const tracks = player.queue.tracks;
        if (tracks.length === 0) {
          await interaction.reply({
            content: "📑 The queue is currently empty (only current song playing).",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const top10 = tracks.slice(0, 10);
        const description = top10
          .map(
            (t, i) =>
              `**${i + 1}.** [${truncate(t.info.title, 40)}](${t.info.uri}) — \`${formatDuration(
                t.info.duration
              )}\``
          )
          .join("\n");

        const qEmbed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`📑 Server Queue (${tracks.length} tracks)`)
          .setDescription(description)
          .setFooter({
            text: tracks.length > 10 ? `Showing first 10 of ${tracks.length} tracks` : "End of queue",
          });

        await interaction.reply({ embeds: [qEmbed], flags: MessageFlags.Ephemeral });
        break;
      }

      default:
        break;
    }
  } catch (error) {
    console.error(`[ButtonHandler] Error handling button ${customId}:`, error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "⚠️ An error occurred while processing this action.",
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}
