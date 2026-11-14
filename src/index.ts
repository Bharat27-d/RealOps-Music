import { MusicClient } from "./structures/MusicClient.js";
import { config } from "./config.js";

async function bootstrap() {
  console.log("==========================================");
  console.log("          RealOps Music Bot               ");
  console.log("==========================================");

  if (!config.discord.token) {
    console.error("❌ ERROR: DISCORD_TOKEN is missing in your .env file!");
    console.error("Please copy .env.example to .env and insert your bot credentials.");
    process.exit(1);
  }

  if (!config.discord.clientId) {
    console.error("❌ ERROR: CLIENT_ID is missing in your .env file!");
    console.error("Please add your Discord Application Client ID to .env.");
    process.exit(1);
  }

  const client = new MusicClient();

  // Process safety
  process.on("unhandledRejection", (reason, promise) => {
    console.error("[Process] Unhandled Rejection at:", promise, "reason:", reason);
  });

  process.on("uncaughtException", (err) => {
    console.error("[Process] Uncaught Exception:", err);
  });

  const gracefulShutdown = async () => {
    console.log("\n🛑 Gracefully shutting down...");
    try {
      // Destroy all active players
      for (const player of client.lavalink.players.values()) {
        await player.destroy("Process shutdown").catch(() => null);
      }
      client.destroy();
    } catch {
      // Ignore cleanup error
    }
    process.exit(0);
  };

  process.on("SIGINT", gracefulShutdown);
  process.on("SIGTERM", gracefulShutdown);

  try {
    await client.login(config.discord.token);
  } catch (error) {
    console.error("❌ Failed to log in to Discord:", error);
    process.exit(1);
  }
}

bootstrap();

