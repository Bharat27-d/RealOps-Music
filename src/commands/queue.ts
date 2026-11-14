import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
} from "discord.js";
import type { MusicClient } from "../structures/MusicClient.js";
import type { Command } from "../types/index.js";
import { formatDuration, truncate } from "../utils/formatters.js";

export const queueCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("queue")
    .setDescription("View the server music queue with interactive pagination")
    .addIntegerOption((opt) =>
      opt.setName("page").setDescription("Page number to view").setMinValue(1)
    ),

  async execute(interaction: ChatInputCommandInteraction, client: MusicClient) {
    const player = client.lavalink.getPlayer(interaction.guildId!);

    if (!player || (!player.queue.current && player.queue.tracks.length === 0)) {
      await interaction.reply({ content: "The queue is currently empty.", flags: MessageFlags.Ephemeral });
      return;
    }

    const tracks = player.queue.tracks;
    const pageSize = 10;
    const totalPages = Math.ceil(tracks.length / pageSize) || 1;
    let currentPage = Math.min(interaction.options.getInteger("page") || 1, totalPages);

    const generateEmbed = (page: number) => {
      const startIndex = (page - 1) * pageSize;
      const currentTracks = tracks.slice(startIndex, startIndex + pageSize);

      const current = player.queue.current;
      const currentText = current
        ? `**Now Playing:** [${truncate(current.info.title, 45)}](${current.info.uri}) — \`${formatDuration(
            current.info.duration
          )}\`\n\n`
        : "";

      const queueList = currentTracks.length
        ? currentTracks
            .map(
              (t, i) =>
                `**${startIndex + i + 1}.** [${truncate(t.info.title, 40)}](${t.info.uri}) — \`${formatDuration(
                  t.info.duration
                )}\``
            )
            .join("\n")
        : "*No more tracks in queue.*";

      const totalDuration = tracks.reduce((acc, t) => acc + (t.info?.duration || 0), 0);

      return new EmbedBuilder()
        .setColor(0x2b2d31)
        .setTitle(`Server Queue (${tracks.length} tracks)`)
        .setDescription(`${currentText}**Up Next:**\n${queueList}`)
        .addFields({
          name: "Total Queue Time",
          value: `\`${formatDuration(totalDuration)}\``,
          inline: true,
        })
        .setFooter({ text: `Page ${page} of ${totalPages}` })
        .setTimestamp();
    };

    const getRow = (page: number) => {
      return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("queue_prev")
          .setLabel("Previous")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page <= 1),
        new ButtonBuilder()
          .setCustomId("queue_next")
          .setLabel("Next")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page >= totalPages)
      );
    };

    const response = await interaction.reply({
      embeds: [generateEmbed(currentPage)],
      components: totalPages > 1 ? [getRow(currentPage)] : [],
      fetchReply: true,
    });

    if (totalPages > 1) {
      const collector = response.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 120_000,
      });

      collector.on("collect", async (btnInteraction) => {
        if (btnInteraction.user.id !== interaction.user.id) {
          await btnInteraction.reply({
            content: "Only the person who used /queue can navigate pages.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        if (btnInteraction.customId === "queue_prev") {
          currentPage = Math.max(1, currentPage - 1);
        } else if (btnInteraction.customId === "queue_next") {
          currentPage = Math.min(totalPages, currentPage + 1);
        }

        await btnInteraction.update({
          embeds: [generateEmbed(currentPage)],
          components: [getRow(currentPage)],
        });
      });

      collector.on("end", async () => {
        await interaction.editReply({ components: [] }).catch(() => null);
      });
    }
  },
};
