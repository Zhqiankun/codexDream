import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: resolve(__dirname, "src/main/index.ts") },
    },
  },
  preload: {
    build: {
      externalizeDeps: false,
      rollupOptions: {
        input: resolve(__dirname, "src/preload/index.ts"),
        output: {
          format: "cjs",
          entryFileNames: "index.cjs",
          chunkFileNames: "chunks/[name]-[hash].cjs",
        },
      },
    },
  },
  renderer: {
    plugins: [react()],
    resolve: { alias: { "@renderer": resolve(__dirname, "src/renderer") } },
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      hmr: {
        protocol: "ws",
        host: "127.0.0.1",
        port: 5173,
        clientPort: 5173,
      },
    },
  },
});
