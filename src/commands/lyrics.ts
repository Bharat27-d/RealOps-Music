import { SlashCommandBuilder, type ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import type { MusicClient } from "../structures/MusicClient.js";
import type { Command } from "../types/index.js";
import { fetchLyrics } from "../utils/lyrics.js";
import { truncate } from "../utils/formatters.js";

export const lyricsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("lyrics")
    .setDescription("Fetch synced or plain lyrics for the current song or a search query")
    .addStringOption((opt) =>
      opt.setName("song").setDescription("Specific song name to search for (optional)")
    ),

  async execute(interaction: ChatInputCommandInteraction, client: MusicClient) {
    await interaction.deferReply();

    const querySong = interaction.options.getString("song");
    const player = client.lavalink.getPlayer(interaction.guildId!);

    let titleToSearch = querySong;
    let artistToSearch: string | undefined;
    let duration: number | undefined;

    if (!titleToSearch) {
      if (!player || !player.queue.current) {
        await interaction.editReply({
          content: "❌ Nothing is currently playing. Provide a song name: `/lyrics song:Bohemian Rhapsody`.",
        });
        return;
      }
      titleToSearch = player.queue.current.info.title;
      artistToSearch = player.queue.current.info.author;
      duration = player.queue.current.info.duration;
    }

    const lyrics = await fetchLyrics(titleToSearch, artistToSearch, duration);

    if (!lyrics || (!lyrics.plainLyrics && !lyrics.syncedLyrics)) {
      await interaction.editReply({
        content: `❌ No lyrics found for **${truncate(titleToSearch, 50)}**.`,
      });
      return;
    }

    const text = lyrics.plainLyrics || lyrics.syncedLyrics || "";
    // Truncate to Discord embed limit
    const displayText = text.length > 4000 ? `${text.slice(0, 3950)}...\n*(Lyrics truncated)*` : text;

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`📜 ${truncate(lyrics.title, 50)}`)
      .setAuthor({ name: truncate(lyrics.artist, 40) })
      .setDescription(displayText)
      .setFooter({ text: "Lyrics retrieved via LRCLIB" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};

