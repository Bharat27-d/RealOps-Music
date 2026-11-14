import fs from "fs";
import path from "path";

export interface GuildSettings {
  mode247: boolean;
  voiceChannelId?: string;
  textChannelId?: string;
}

const dataDir = path.resolve(process.cwd(), "data");
const settingsFilePath = path.join(dataDir, "settings.json");

let memoryCache: Record<string, GuildSettings> | null = null;

function ensureDataFile(): void {
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs.existsSync(settingsFilePath)) {
      fs.writeFileSync(settingsFilePath, JSON.stringify({}, null, 2), "utf8");
    }
  } catch (err) {
    console.error("[GuildSettings] Error ensuring data file:", err);
  }
}

function loadSettings(): Record<string, GuildSettings> {
  if (memoryCache !== null) return memoryCache;
  ensureDataFile();
  try {
    const raw = fs.readFileSync(settingsFilePath, "utf8");
    memoryCache = JSON.parse(raw);
  } catch (err) {
    console.error("[GuildSettings] Error reading settings:", err);
    memoryCache = {};
  }
  return memoryCache || {};
}

function saveSettings(settings: Record<string, GuildSettings>): void {
  memoryCache = settings;
  ensureDataFile();
  try {
    fs.writeFileSync(settingsFilePath, JSON.stringify(settings, null, 2), "utf8");
  } catch (err) {
    console.error("[GuildSettings] Error saving settings:", err);
  }
}

export function getGuildSettings(guildId: string): GuildSettings {
  const all = loadSettings();
  return all[guildId] || { mode247: false };
}

export function setGuild247(
  guildId: string,
  enabled: boolean,
  voiceChannelId?: string,
  textChannelId?: string
): void {
  const all = loadSettings();
  if (!all[guildId]) {
    all[guildId] = { mode247: enabled, voiceChannelId, textChannelId };
  } else {
    all[guildId].mode247 = enabled;
    if (voiceChannelId) all[guildId].voiceChannelId = voiceChannelId;
    if (textChannelId) all[guildId].textChannelId = textChannelId;
  }
  saveSettings(all);
}

export function getAll247Guilds(): Array<{ guildId: string; voiceChannelId: string; textChannelId?: string }> {
  const all = loadSettings();
  const list: Array<{ guildId: string; voiceChannelId: string; textChannelId?: string }> = [];
  for (const [guildId, val] of Object.entries(all)) {
    if (val.mode247 && val.voiceChannelId) {
      list.push({ guildId, voiceChannelId: val.voiceChannelId, textChannelId: val.textChannelId });
    }
  }
  return list;
}

