import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The git layer runs in Electron's main process, so tests run in Node.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    passWithNoTests: true,
    // Git tests create real repos; keep them independent of your personal git config.
    env: {
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1'
    }
  }
})
