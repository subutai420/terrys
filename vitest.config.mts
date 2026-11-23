import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'
import { BaseSequencer, type TestSpecification } from 'vitest/node'

/**
 * Integration test files share ONE database and some assert facts about an empty database (the
 * very first user becomes admin). Vitest's default order depends on a local timing cache, so the
 * order differed between machines; this runs the files alphabetically everywhere (stage 9).
 */
class AlphabeticalSequencer extends BaseSequencer {
  async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    return [...files].sort((a, b) => a.moduleId.localeCompare(b.moduleId))
  }
}

/**
 * Two groups of tests:
 *
 * - `unit` – fast tests of plain functions, no database or browser needed.
 *   Put them next to the code as `*.test.ts` (in `src/`). Run alone: `pnpm test:unit`.
 * - `int`  – integration tests in `tests/int/*.int.test.ts`. They start Payload (local API)
 *   against a throwaway PostgreSQL database that `tests/int/globalSetup.ts` creates in the
 *   server from DATABASE_URL and drops afterwards. The database server must be running
 *   (`docker compose up -d`); your development data is never touched.
 *
 * `pnpm test` runs both. Browser tests live in tests/e2e (Playwright).
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    projects: [
      {
        plugins: [tsconfigPaths()],
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        plugins: [tsconfigPaths()],
        test: {
          name: 'int',
          environment: 'node',
          include: ['tests/int/**/*.int.test.ts'],
          globalSetup: ['tests/int/globalSetup.ts'],
          // Points DATABASE_URL at the throwaway database before any test file is imported.
          setupFiles: ['tests/int/setupEnv.ts'],
          // Starting Payload and creating the schema takes a while on the first test.
          testTimeout: 60_000,
          hookTimeout: 180_000,
          // One test file at a time: they share one database.
          fileParallelism: false,
          sequence: { sequencer: AlphabeticalSequencer },
        },
      },
    ],
  },
})
