import {
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type GuildMember,
  type VoiceBasedChannel,
  PermissionsBitField,
} from 'discord.js';
import { playerManager, type GuildPlayer } from '../music/index.js';

export interface PreconditionSuccess {
  success: true;
  member: GuildMember;
  voiceChannel: VoiceBasedChannel;
  player: GuildPlayer | undefined;
}

export interface PreconditionFailure {
  success: false;
  errorMessage: string;
}

export type PreconditionResult = PreconditionSuccess | PreconditionFailure;

/**
 * Validates standard music command preconditions:
 * 1. Command must be executed in a guild.
 * 2. User must be connected to a voice channel.
 * 3. User must be in the same voice channel as the bot if the bot is already connected.
 * 4. Bot must possess Connect and Speak permissions in the target channel.
 * 5. If requireActivePlayer is true, verifies that an active player instance exists.
 */
export async function checkVoicePreconditions(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  requireActivePlayer = false,
): Promise<PreconditionResult> {
  const guild = interaction.guild;
  if (!guild) {
    return {
      success: false,
      errorMessage: 'This command can only be used in a server.',
    };
  }

  const member = interaction.member as GuildMember | null;
  const voiceChannel = member?.voice?.channel;

  if (!voiceChannel) {
    return {
      success: false,
      errorMessage: 'You must be in a voice channel to use music commands.',
    };
  }

  const existingPlayer = playerManager.get(guild.id);

  // If the bot is already connected to voice in this guild, user must be in the same channel
  if (existingPlayer) {
    if (existingPlayer.voiceChannelId !== voiceChannel.id) {
      return {
        success: false,
        errorMessage: 'You must be in the same voice channel as the bot.',
      };
    }
  } else {
    // If bot is not connected yet, verify bot's permissions to join and speak
    const botMember = guild.members.me;
    if (botMember) {
      const permissions = voiceChannel.permissionsFor(botMember);
      if (
        !permissions.has(PermissionsBitField.Flags.Connect) ||
        !permissions.has(PermissionsBitField.Flags.Speak)
      ) {
        return {
          success: false,
          errorMessage: 'The bot lacks permissions to Connect or Speak in your voice channel.',
        };
      }
    }
  }

  if (requireActivePlayer && (!existingPlayer || !existingPlayer.queue.current)) {
    return {
      success: false,
      errorMessage: 'Nothing is currently playing in this server.',
    };
  }

  return {
    success: true,
    member,
    voiceChannel,
    player: existingPlayer,
  };
}
