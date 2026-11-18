import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      DISCORD_TOKEN: 'mock_test_discord_token',
      CLIENT_ID: '123456789012345678',
      OWNER_IDS: '123456789012345678',
      LAVALINK_NODES: JSON.stringify([
        {
          name: 'primary',
          host: '127.0.0.1',
          port: 2333,
          password: 'youshallnotpass',
          secure: false,
          role: 'primary',
        },
      ]),
      LOG_LEVEL: 'fatal',
    },
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/scripts/**'],
    },
  },
});
