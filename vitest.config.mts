import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: { environment: "node", include: ["src/**/*.test.ts"], hookTimeout: 30_000, testTimeout: 30_000, env: { SESSION_SECRET: "test-secret-test-secret-test-secret-123" } },
});
