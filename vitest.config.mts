import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    passWithNoTests: true,
    // The server tests drive real sockets and a real deadline sweeper.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
