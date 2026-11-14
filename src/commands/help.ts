import { SlashCommandBuilder, type ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import type { MusicClient } from "../structures/MusicClient.js";
import type { Command } from "../types/index.js";

export const helpCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Display the list of available commands and features"),

  async execute(interaction: ChatInputCommandInteraction, _client: MusicClient) {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("🎵 RealOps Music — Command Center")
      .setDescription("Enterprise-grade Discord music bot with high-fidelity audio and cross-platform streaming.")
      .addFields(
        {
          name: "🎶 Playback Commands",
          value:
            "`/play <query>` - Play song, playlist, or stream (Spotify, YT, SoundCloud, Apple Music)\n" +
            "`/pause` - Pause playback\n" +
            "`/resume` - Resume playback\n" +
            "`/skip [to]` - Skip current or jump to track\n" +
            "`/previous` - Play previously played song\n" +
            "`/stop` - Stop music, clear queue, and leave VC\n" +
            "`/seek <time>` - Seek to a timestamp (e.g. `1:30`)\n" +
            "`/volume <1-200>` - Change playback volume",
        },
        {
          name: "📑 Queue & Playlist",
          value:
            "`/nowplaying` - View interactive controller embed with buttons\n" +
            "`/queue [page]` - Paginated server queue\n" +
            "`/shuffle` - Randomize queue order\n" +
            "`/loop <mode>` - Off, Single Track, or Whole Queue\n" +
            "`/clear` - Clear all queued tracks\n" +
            "`/remove <pos>` - Remove a specific song\n" +
            "`/move <from> <to>` - Reorder songs in queue\n" +
            "`/jump <pos>` - Jump directly to a track",
        },
        {
          name: "🎧 Audio DSP & Effects",
          value:
            "`/filter <preset>` - Bass Boost, Nightcore, Vaporwave, 8D Audio, Tremolo, Karaoke, Clear",
        },
        {
          name: "⚙️ Smart Features",
          value:
            "`/autoplay` - Toggle automatic song recommendations when queue ends\n" +
            "`/247` - Toggle 24/7 staying in voice channel\n" +
            "`/lyrics [song]` - View synchronized or plain lyrics",
        }
      )
      .setFooter({ text: "RealOps Music • Powered by Lavalink v4" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};

