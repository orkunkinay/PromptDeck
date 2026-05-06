import react from "@vitejs/plugin-react-swc";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => {
  const debugExtensionBuild = mode === "development";

  return {
    plugins: [react()],
    esbuild: {
      legalComments: "none",
      charset: "ascii"
    },
    build: {
      outDir: "dist",
      emptyOutDir: false,
      minify: debugExtensionBuild ? false : "esbuild",
      sourcemap: debugExtensionBuild,
      cssCodeSplit: false,
      lib: {
        entry: resolve(__dirname, "src/content/index.ts"),
        name: "PromptDeckContent",
        formats: ["iife"],
        fileName: () => "content/index.js"
      },
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
          extend: true
        }
      }
    }
  };
});
