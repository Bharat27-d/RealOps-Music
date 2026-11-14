import type {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  SlashCommandOptionsOnlyBuilder,
} from "discord.js";
import type { MusicClient } from "../structures/MusicClient.js";

export interface Command {
  data:
    | SlashCommandBuilder
    | SlashCommandSubcommandsOnlyBuilder
    | SlashCommandOptionsOnlyBuilder
    | Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">;
  execute: (
    interaction: ChatInputCommandInteraction,
    client: MusicClient
  ) => Promise<unknown>;
}

export interface PlayerCustomData {
  mode247?: boolean;
  autoplay?: boolean;
  lastMessageId?: string;
  voteSkips?: Set<string>;
  trackStartedAt?: number;        // Unix ms when current track started playing
  lastCleanEndId?: string | null; // Identifier of track that last ended via trackEnd (cleanly)
  queueEndedAt?: number;          // Unix ms when queueEnd last fired
}

export function getCustomData(player: any): PlayerCustomData {
  return (player.get("customData") || {}) as PlayerCustomData;
}

export function setCustomData(player: any, data: PlayerCustomData): void {
  player.set("customData", data);
}

export interface LyricsResult {
  title: string;
  artist: string;
  album?: string;
  plainLyrics?: string;
  syncedLyrics?: string;
}

