import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // Integration tests hit a real Postgres + Redis; allow generous timeouts
    // for the first test to warm up the Prisma connection.
    testTimeout: 20_000,
    hookTimeout: 30_000,
    pool: 'forks',
    poolOptions: {
      // Default is one fork per CPU — but our tests share Postgres+Redis and
      // small race windows show up when 12 workers create boards in parallel.
      // Single-fork keeps things deterministic for the hackathon.
      forks: { singleFork: true },
    },
  },
})
