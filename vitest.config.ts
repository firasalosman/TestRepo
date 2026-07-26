import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "node",
    // Component tests opt into jsdom individually via a
    // `// @vitest-environment jsdom` docblock at the top of the file, so the
    // large majority of pure-logic tests keep the faster node environment.
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
