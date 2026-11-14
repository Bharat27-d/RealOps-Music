# 🎵 RealOps Music Bot

An enterprise-grade, high-fidelity Discord music bot built with **TypeScript**, **discord.js v14**, and **Lavalink v4**. Features full cross-platform audio streaming, real-time audio DSP filters, synchronized lyrics, interactive Discord button controls, and smart queue management.

---

## 🌟 Key Features

* **Multi-Platform Audio:** Seamless playback from **Spotify**, **YouTube & YouTube Music**, **SoundCloud**, **Apple Music**, **Deezer**, **Bandcamp**, **Twitch**, and direct HTTP/Radio streams.
* **Modern Discord UI (Components v2):** Dynamic "Now Playing" embed with interactive buttons (`⏮️`, `⏯️`, `⏭️`, `⏹️`, `🔁`, `🔀`, `🔉`, `🔊`, `📜`, `📑`) and dynamic animated progress bar.
* **Audio DSP & Filters:** Real-time hardware-accelerated filters:
  * 🔊 **Bass Boost** (High EQ boost)
  * 🌙 **Nightcore** (Speed + Pitch up)
  * 🌊 **Vaporwave** (Slow down + Reverb mood)
  * 🎧 **8D Audio** (Smooth 360° rotating stereo surround)
  * 〰️ **Tremolo** (Wavy acoustic modulation)
  * 🎤 **Karaoke** (Voice suppression)
* **Smart Autoplay:** Automatically queues and streams recommended tracks when the current queue ends.
* **Synchronized & Plain Lyrics:** Instant lyrics retrieval powered by [LRCLIB](https://lrclib.net).
* **24/7 Mode:** Toggle whether the bot remains permanently connected in the voice channel.
* **Auto-Inactivity Disconnect:** Leaves voice channel when idle or alone (configurable timers) to preserve bandwidth.
* **Interactive Paginated Queue:** Next/Previous buttons for queues with hundreds of songs.

---

## 📋 Slash Commands Reference

| Command | Description |
| :--- | :--- |
| `/play <query> [source]` | Play track/playlist/stream by URL or search query (Spotify, YT, SoundCloud, Apple Music) |
| `/pause` | Pause the current track |
| `/resume` | Resume playback |
| `/skip [to]` | Skip current song or jump to a specific queue index |
| `/previous` | Play the previous track from history |
| `/stop` | Stop playback, clear queue, and leave voice channel |
| `/seek <time>` | Seek to timestamp (e.g., `1:30`, `90s`, `02:45`) |
| `/volume <1-200>` | Adjust volume level (1% to 200%) |
| `/nowplaying` | Show real-time player controller with interactive buttons |
| `/queue [page]` | View interactive server queue with pagination |
| `/shuffle` | Randomize the order of tracks in the queue |
| `/loop <mode>` | Toggle repeat mode: `Off`, `Current Track`, or `Entire Queue` |
| `/clear` | Clear all queued songs (keeps current song playing) |
| `/remove <position>` | Remove a song by position number |
| `/move <from> <to>` | Move a song to a different position in queue |
| `/jump <position>` | Jump directly to a track in the queue |
| `/filter <preset>` | Apply audio filters (Bassboost, Nightcore, Vaporwave, 8D, etc.) |
| `/lyrics [song]` | Retrieve lyrics for current or searched track |
| `/autoplay` | Toggle smart auto-queue recommendations |
| `/247` | Toggle 24/7 staying in voice channel |
| `/help` | Show command reference guide |

---

## 🚀 Deployment Options

### Method 1: Docker & Docker Compose (Recommended for Servers)

This method runs both the **Lavalink v4 Audio Server** and the **Music Bot** in isolated containers.

1. **Clone/Copy the project to your server:**
   ```bash
   cd RealOps\ Music
   ```

2. **Configure your `.env` file:**
   ```bash
   cp .env.example .env
   # Edit .env with your DISCORD_TOKEN, CLIENT_ID, and SPOTIFY credentials
   ```

3. **Start the containers:**
   ```bash
   docker compose up -d --build
   ```

4. **View logs:**
   ```bash
   docker compose logs -f
   ```

---

### Method 2: Direct Hosting on Server (PM2 / Standalone)

If you already run other bots on your server using PM2 or Node:

#### 1. Start the Lavalink Audio Engine:
Download Lavalink v4:
```bash
cd lavalink
# Download Lavalink.jar (v4)
curl -LO https://github.com/lavalink-devs/Lavalink/releases/latest/download/Lavalink.jar
# Start Lavalink in background using Java 21:
java -jar Lavalink.jar &
```
*(Or use PM2 for Lavalink: `pm2 start "java -jar Lavalink.jar" --name lavalink`)*

#### 2. Start the Bot:
```bash
npm install
npm run build
pm2 start dist/index.js --name realops-music
```

---

## 🔑 Configuration Settings (`.env`)

```ini
# Discord Application Credentials (from https://discord.com/developers/applications)
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_client_id_here

# Lavalink Node (Default: localhost:2333)
LAVALINK_HOST=localhost
LAVALINK_PORT=2333
LAVALINK_PASSWORD=youshallnotpass
LAVALINK_SECURE=false

# Spotify Developer API (Free from https://developer.spotify.com/dashboard)
# Required to resolve Spotify playlists and track metadata
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret

# Player Behavior
DEFAULT_VOLUME=80
DEFAULT_SEARCH_PLATFORM=ytmsearch
AUTO_DISCONNECT_EMPTY_SECONDS=180
AUTO_DISCONNECT_IDLE_SECONDS=300
DEFAULT_247_MODE=false
```

---

## 🛡️ Discord Developer Portal Checklist

When setting up your bot application in the [Discord Developer Portal](https://discord.com/developers/applications):

1. **Bot > Privileged Gateway Intents:**
   * Enable **Server Members Intent** (Optional, recommended)
   * Enable **Message Content Intent** (Required if using text prefixes)
2. **OAuth2 > URL Generator:**
   * Scopes: `bot`, `applications.commands`
   * Bot Permissions:
     * `Connect`
     * `Speak`
     * `Use Voice Activity`
     * `Send Messages`
     * `Embed Links`
     * `Attach Files`
     * `Read Message History`

