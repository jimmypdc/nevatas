import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Integration tests hit a real Postgres and import server-only modules
    // (e.g. next/server). Excluded from the default unit-test run; opt in
    // with RUN_DB_INTEGRATION_TESTS=1.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      ...(process.env.RUN_DB_INTEGRATION_TESTS === "1"
        ? []
        : ["**/*.integration.test.ts"]),
    ],
    globals: false,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
