import { SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { env } from '../config/env.js';
import { lavalinkService } from '../lavalink/service.js';
import { nodeHealthTracker } from '../lavalink/nodeHealthTracker.js';
import { circuitBreaker } from '../music/circuitBreaker.js';
import { playerManager } from '../music/manager.js';
import { errorEmbed, COLOURS } from '../utils/embed.js';
import { formatDuration } from '../utils/time.js';
import { type Command } from '../core/loader.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Display bot infrastructure, Lavalink node health, and circuit breaker status (Owner Only)'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    // 1. Strict Owner Precondition
    if (!env.OWNER_IDS.includes(interaction.user.id)) {
      await interaction.reply({
        embeds: [errorEmbed('This administrative command is restricted to bot owners.')],
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    // 2. Collect Telemetry
    const lavalinkStats = lavalinkService.stats();
    const breakerStates = circuitBreaker.getAllStates();
    const ytHealthStates = nodeHealthTracker.getAllNodeStatus();
    const mem = process.memoryUsage();
    const botPing = interaction.client.ws.ping;
    const uptime = Math.floor(process.uptime() * 1000);

    const embed = new EmbedBuilder()
      .setColor(lavalinkStats.healthy ? COLOURS.primary : COLOURS.error)
      .setTitle('Infrastructure & Operations Status')
      .setTimestamp();

    // ── System Performance Section ──────────────────────────────────────────
    embed.addFields({
      name: 'Bot Host & Runtime',
      value: [
        `• **Gateway Ping:** \`${botPing}ms\``,
        `• **Process Uptime:** \`${formatDuration(uptime)}\``,
        `• **Active Guild Players:** \`${playerManager.count}\``,
        `• **Memory (RSS):** \`${(mem.rss / 1024 / 1024).toFixed(1)} MB\``,
        `• **Memory (Heap Used):** \`${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB\``,
      ].join('\n'),
      inline: false,
    });

    // ── Lavalink Nodes Section ──────────────────────────────────────────────
    if (lavalinkStats.nodes.length === 0) {
      embed.addFields({
        name: 'Lavalink Nodes',
        value: 'No Lavalink nodes configured or active.',
      });
    } else {
      const nodeLines = lavalinkStats.nodes.map((node) => {
        const isDegraded = ytHealthStates[node.name]?.isDegradedForYouTube ?? false;
        const statusIndicator = node.isHealthy ? '🟢' : '🔴';
        const ytFlag = isDegraded ? '⚠️ **[DEGRADED FOR YOUTUBE]**' : '✅ [YT OK]';

        const memInfo = node.memory
          ? `${(node.memory.used / 1024 / 1024).toFixed(0)}MB / ${(node.memory.allocated / 1024 / 1024).toFixed(0)}MB`
          : 'N/A';

        const cpuInfo = node.cpu
          ? `${(node.cpu.lavalinkLoad * 100).toFixed(1)}%`
          : 'N/A';

        return [
          `${statusIndicator} **${node.name}** (\`${node.role}\`)`,
          `  • Status: \`${node.state}\` | Penalty: \`${node.penalties}\``,
          `  • YouTube Status: ${ytFlag}`,
          `  • Players: \`${node.playingPlayers} playing\` / \`${node.players} total\``,
          `  • Lavalink Memory: \`${memInfo}\` | CPU Load: \`${cpuInfo}\``,
          `  • Node Uptime: \`${formatDuration(node.uptime)}\``,
        ].join('\n');
      });

      embed.addFields({
        name: `Lavalink Nodes (${lavalinkStats.connectedNodes}/${lavalinkStats.totalNodes} Connected)`,
        value: nodeLines.join('\n\n'),
        inline: false,
      });
    }

    // ── Circuit Breakers Section ────────────────────────────────────────────
    const breakerEntries = Object.entries(breakerStates);
    if (breakerEntries.length > 0) {
      const breakerLines = breakerEntries.map(([source, data]) => {
        const badge =
          data.state === 'CLOSED' ? '🟢 CLOSED' : data.state === 'OPEN' ? '🔴 OPEN (Tripped)' : '🟡 HALF-OPEN';

        let line = `• **${source.toUpperCase()}:** \`${badge}\` (${data.failures} recent failures)`;
        if (data.state === 'OPEN') {
          line += ` — Cooldown: \`${Math.round(data.cooldownRemainingMs / 1000)}s remaining\``;
        }
        return line;
      });

      embed.addFields({
        name: 'Per-Source Circuit Breakers',
        value: breakerLines.join('\n'),
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;

