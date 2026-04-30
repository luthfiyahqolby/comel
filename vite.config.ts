import { defineConfig } from "vite";

export default defineConfig({
  // Relative base keeps assets working on GitHub Pages repo URLs:
  // https://username.github.io/repository-name/
  base: "./",
  server: {
    host: "0.0.0.0",
    port: 5173
  }
});
