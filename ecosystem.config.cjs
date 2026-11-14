module.exports = {
  apps: [
    {
      name: "realops-lavalink",
      script: "java",
      args: ["-Xmx1G", "-jar", "Lavalink.jar"],
      cwd: "./lavalink",
      autorestart: true,
      restart_delay: 4000,
      max_restarts: 10,
    },
    {
      name: "realops-music-bot",
      script: "dist/index.js",
      cwd: "./",
      autorestart: true,
      restart_delay: 3000,
      max_restarts: 10,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
