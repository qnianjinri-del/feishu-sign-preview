import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    css: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      exclude: ["src/main.tsx", "src/vite-env.d.ts", "src-tauri/**"],
      thresholds: { statements: 80, functions: 80, lines: 80, branches: 70 },
    },
  },
});
