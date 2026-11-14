import { SlashCommandBuilder, type ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import type { MusicClient } from "../structures/MusicClient.js";
import type { Command } from "../types/index.js";

export const helpCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Display the list of available commands and features"),

  async execute(interaction: ChatInputCommandInteraction, _client: MusicClient) {
    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle("RealOps Music — Commands")
      .setDescription("High-fidelity audio streaming and music controls for Discord.")
      .addFields(
        {
          name: "Playback",
          value:
            "`/play <query>` - Play song, playlist, or stream\n" +
            "`/pause` - Pause playback\n" +
            "`/resume` - Resume playback\n" +
            "`/skip [to]` - Skip current track or jump to index\n" +
            "`/previous` - Play previously played song\n" +
            "`/stop` - Stop music, clear queue, and leave voice channel\n" +
            "`/seek <time>` - Seek to timestamp (e.g. `1:30`)\n" +
            "`/volume <1-200>` - Change playback volume",
        },
        {
          name: "Queue & Playlist",
          value:
            "`/nowplaying` - View interactive controller\n" +
            "`/queue [page]` - Paginated server queue\n" +
            "`/shuffle` - Randomize queue order\n" +
            "`/loop <mode>` - Off, Single Track, or Whole Queue\n" +
            "`/clear` - Clear all queued tracks\n" +
            "`/remove <pos>` - Remove a specific song\n" +
            "`/move <from> <to>` - Reorder songs in queue\n" +
            "`/jump <pos>` - Jump directly to a track",
        },
        {
          name: "Audio DSP & Effects",
          value:
            "`/filter <preset>` - Bass Boost, Nightcore, Vaporwave, 8D Audio, Tremolo, Karaoke, Clear",
        },
        {
          name: "Smart Features",
          value:
            "`/autoplay` - Toggle automatic song recommendations\n" +
            "`/247` - Toggle 24/7 mode\n" +
            "`/lyrics [song]` - View synchronized or plain lyrics",
        }
      )
      .setFooter({ text: "RealOps Music" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
