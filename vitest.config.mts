import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: { environment: "node", include: ["src/**/*.test.ts"], hookTimeout: 30_000, testTimeout: 30_000 },
});
