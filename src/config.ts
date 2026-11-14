import dotenv from "dotenv";
dotenv.config();

export interface BotConfig {
  discord: {
    token: string;
    clientId: string;
  };
  lavalink: {
    host: string;
    port: number;
    password: string;
    secure: boolean;
  };
  spotify: {
    clientId?: string;
    clientSecret?: string;
  };
  player: {
    defaultVolume: number;
    defaultSearchPlatform: string;
    autoDisconnectEmptySec: number;
    autoDisconnectIdleSec: number;
    default247Mode: boolean;
  };
}

export const config: BotConfig = {
  discord: {
    token: process.env.DISCORD_TOKEN || "",
    clientId: process.env.CLIENT_ID || "",
  },
  lavalink: {
    host: process.env.LAVALINK_HOST || "localhost",
    port: parseInt(process.env.LAVALINK_PORT || "2333", 10),
    password: process.env.LAVALINK_PASSWORD || "youshallnotpass",
    secure: process.env.LAVALINK_SECURE === "true",
  },
  spotify: {
    clientId: process.env.SPOTIFY_CLIENT_ID || undefined,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET || undefined,
  },
  player: {
    defaultVolume: Math.min(Math.max(parseInt(process.env.DEFAULT_VOLUME || "80", 10), 1), 200),
    defaultSearchPlatform: process.env.DEFAULT_SEARCH_PLATFORM || "ytmsearch",
    autoDisconnectEmptySec: parseInt(process.env.AUTO_DISCONNECT_EMPTY_SECONDS || "180", 10),
    autoDisconnectIdleSec: parseInt(process.env.AUTO_DISCONNECT_IDLE_SECONDS || "300", 10),
    default247Mode: process.env.DEFAULT_247_MODE === "true",
  },
};

