import react from "@vitejs/plugin-react-swc";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig(({ mode }) => {
  const debugExtensionBuild = mode === "development";

  return {
    plugins: [
      react(),
      viteStaticCopy({
        targets: [{ src: "src/manifest.json", dest: "." }]
      })
    ],
    build: {
      modulePreload: {
        polyfill: false
      },
      minify: debugExtensionBuild ? false : "esbuild",
      sourcemap: debugExtensionBuild,
      outDir: "dist",
      emptyOutDir: true,
      rollupOptions: {
        input: {
          background: resolve(__dirname, "src/background/index.ts"),
          content: resolve(__dirname, "src/content/index.ts"),
          popup: resolve(__dirname, "src/popup/index.html"),
          options: resolve(__dirname, "src/options/index.html")
        },
        output: {
          entryFileNames: (chunk) => {
            if (chunk.name === "background") return "background/index.js";
            if (chunk.name === "content") return "content/index.js";
            return "assets/[name]-[hash].js";
          },
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]"
        }
      }
    }
  };
});
