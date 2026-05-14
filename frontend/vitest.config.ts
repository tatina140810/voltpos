import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Отдельный конфиг для vitest — не смешиваем с прод-сборкой.
// jsdom нужен потому что компоненты дёргают document/localStorage/IndexedDB.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    css: false,
  },
});
