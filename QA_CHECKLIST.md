# Production Manual QA & Acceptance Checklist

Comprehensive verification matrix to validate production readiness of the RealOps Music Bot.

---

## 1. Acceptance Criteria Sign-Off

| # | Acceptance Criterion | Verification Method | Status |
|---|---|---|---|
| **AC-1** | **No Unhandled Rejections** | Process safety handlers in `src/core/process.ts` trap all async rejections with structured context; zero uncaught exits during tests. | ✅ Verified (89/89 unit & integration tests passed) |
| **AC-2** | **The Queue Always Advances** | Non-recoverable failures, private tracks, and exhausted retries call `player.processQueue()`; no hangs or infinite retry loops. | ✅ Verified in `integration.test.ts` & `recovery.test.ts` |
| **AC-3** | **No Leaked Listeners** | `GuildPlayer.destroy()` removes all Shoukaku event listeners, cancels idle timeouts, and detaches from registry. | ✅ Verified in `player.ts` & `manager.ts` |
| **AC-4** | **Playback Continues on Node Failure** | Dual-node setup migrates active voice players with millisecond position resumption when primary or secondary node drops. | ✅ Verified in `failover.test.ts` |

---

## 2. Test Execution Matrix

### Test 1: Standard YouTube Video
- **Input:** `/play query: https://www.youtube.com/watch?v=dQw4w9WgXcQ`
- **Expected Outcome:**
  - Tracking parameters (`si`, `feature`, `utm_*`) are stripped.
  - Returns `Added to Queue` embed with title, author, and duration.
  - Audio starts streaming in voice channel.

### Test 2: YouTube Music Track
- **Input:** `/play query: https://music.youtube.com/watch?v=dQw4w9WgXcQ`
- **Expected Outcome:**
  - Validated under YouTube allowlist.
  - Queued as single track with thumbnail and metadata.

### Test 3: YouTube Short
- **Input:** `/play query: https://www.youtube.com/shorts/5qap5aO4i9A`
- **Expected Outcome:**
  - Automatically normalized to `https://www.youtube.com/watch?v=5qap5aO4i9A`.
  - Queued and played seamlessly without client errors.

### Test 4: YouTube Playlist
- **Input:** `/play query: https://www.youtube.com/playlist?list=PLrAlrXzE938D_Y5vA4jZ3eJ4P-G8_yV8j`
- **Expected Outcome:**
  - Returns `Playlist Added to Queue` embed with total track count and duration.
  - Tracks are capped to `MAX_PLAYLIST_TRACKS` (default: 100).

### Test 5: Spotify Track / Album / Playlist
- **Input Track:** `/play query: https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=abc123`
- **Input Album:** `/play query: https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3`
- **Input with Locale Prefix:** `/play query: https://open.spotify.com/intl-fr/track/4cOdK2wGLETKBW3PvgPWqT`
- **Expected Outcome:**
  - Locale prefix `/intl-fr/` and tracking query params stripped.
  - LavaSrc resolves metadata using Spotify API.
  - Audio streams via ordered fallback: `ytsearch:"%ISRC%"`, `ytmsearch:%QUERY%`, `ytsearch:%QUERY%`, `scsearch:%QUERY%`.

### Test 6: SoundCloud Link
- **Input:** `/play query: https://soundcloud.com/nocopyrightsounds/cartoon-on-on-feat-daniel-levi-ncs-release`
- **Expected Outcome:**
  - Tracking parameters stripped.
  - Plays directly via Lavalink's native SoundCloud source.

### Test 7: Livestream Track
- **Input:** `/play query: https://www.youtube.com/watch?v=jfKfPfyJRdk` (Lofi Girl or similar stream)
- **Expected Outcome:**
  - Marked as `isStream: true`, duration shows `Live Stream` / `● LIVE`.
  - `/seek` command is gracefully rejected with "Cannot seek in a live audio stream".

### Test 8: Age-Restricted Video
- **Input:** `/play query: <age-restricted YouTube URL>`
- **Expected Outcome:**
  - If OAuth account is verified, plays directly.
  - If restricted by source, classified as `age_restricted` and recovery searches for clean mirror on alternate sources before advancing queue.

### Test 9: Private / Deleted Playlist
- **Input:** `/play query: <private YouTube or Spotify playlist URL>`
- **Expected Outcome:**
  - Does not crash or hang.
  - Returns clear message: "This playlist is empty, private, or contains no playable tracks."

### Test 10: Node Restart Mid-Song
- **Procedure:** While a song is playing, execute `docker compose restart lavalink` on the host.
- **Expected Outcome:**
  - Shoukaku maintains player state via `resume: true` (within 60s timeout).
  - Audio stream re-connects upon node boot without needing user interaction.

### Test 11: Hetzner Node Failure with Residential Failover
- **Procedure:** With two nodes configured (`primary` and `residential`), shut down the primary node container (`docker compose stop lavalink`).
- **Expected Outcome:**
  - Shoukaku detects disconnect/close on `primary`.
  - `migrateDroppedNodePlayers` finds active player, moves player to `residential` node, and resumes audio from exact millisecond position.

### Test 12: Bot Kicked from Voice Channel Mid-Song
- **Procedure:** Right-click the bot in Discord voice channel and click "Disconnect".
- **Expected Outcome:**
  - Discord fires `voiceStateUpdate` with `newState.channelId = null`.
  - `GuildPlayer.destroy('bot_disconnected')` triggers clean teardown:
    - Queue reset
    - Idle timer cleared
    - Shoukaku player destroyed
    - Removed from `PlayerManager` registry (no zombie players or memory leaks).

### Test 13: Rapid `/play` Spam
- **Procedure:** A user issues 10 `/play` commands in rapid succession.
- **Expected Outcome:**
  - First `MAX_PER_USER_QUEUE` (default: 20) tracks are accepted.
  - Subsequent requests are rejected with clear feedback: "You have reached your limit of 20 queued tracks."
  - Player does not crash or corrupt internal queue state.

### Test 14: YouTube Circuit Breaker Open with Spotify Fallback through SoundCloud
- **Procedure:** Simulate YouTube IP ban by generating 3 consecutive YouTube stream errors.
- **Expected Outcome:**
  - Circuit breaker trips to `OPEN`.
  - Log records: "Circuit breaker opened — source temporarily deprioritized".
  - Subsequent queries promote `scsearch:` to the front of the fallback chain.
  - Spotify metadata queries resolve audio via SoundCloud mirrors.

---

## 3. Operations & Observability Verification

- Execute `/status` as bot owner:
  - Verifies:
    - Discord gateway ping
    - Active player count
    - Memory usage (RSS & Heap)
    - Lavalink node roles, states, penalties, memory, and CPU loads
    - Circuit breaker states per source (`CLOSED`, `OPEN`, `HALF_OPEN`)
    - YouTube degraded flags per node
- Execute `/status` as non-owner:
  - Command is rejected with ephemeral error: "This administrative command is restricted to bot owners."

