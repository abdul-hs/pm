import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    testTimeout: 15_000,
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    coverage: {
      all: true,
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "node_modules",
        "tests",
        "src/test/**",
        "**/*.d.ts",
        "src/app/layout.tsx",
      ],
      reporter: ["text", "html"],
    },
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", "tests"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
