import path from "node:path";
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const src = path.resolve(import.meta.dirname, "src");

export default defineConfig({
  plugins: [viteReact(), tailwindcss()],
  base: "./",
  publicDir: "public",
  resolve: {
    alias: [
      { find: "@/lib/trips-api", replacement: path.join(src, "native/trips-stub.ts") },
      { find: "@/lib/auth/gates", replacement: path.join(src, "native/auth-stub.ts") },
      { find: "@/lib/auth/use-current-user", replacement: path.join(src, "native/auth-stub.ts") },
      { find: "@", replacement: src },
    ],
  },
  build: {
    outDir: "www",
    emptyOutDir: true,
    sourcemap: false,
    minify: "esbuild",
    assetsInlineLimit: 0,
    rollupOptions: {
      input: path.resolve(import.meta.dirname, "index.native.html"),
    },
  },
  esbuild: {
    drop: ["console", "debugger"],
    legalComments: "none",
  },
});
