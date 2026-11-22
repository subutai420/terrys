import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

// Unit tests: fast tests of plain functions, no database or browser needed.
// Put them next to the code as `*.test.ts`. Browser tests live in tests/e2e (Playwright).
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
