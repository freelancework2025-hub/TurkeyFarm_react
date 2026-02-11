import { existsSync, readFileSync } from "fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

/** Strip sourceMappingURL from lucide-react so Vite 7 never tries to load missing/broken .map files */
function stripLucideSourceMaps() {
  const sourceMapCommentRegex = /\n?\/\/# sourceMappingURL=[^\s'"]+\s*$|\n?\/\*# sourceMappingURL=[^*]+\*\/\s*$/gm;
  return {
    name: "strip-lucide-sourcemaps",
    enforce: "pre" as const,
    load(id: string) {
      const normalizedId = id.replace(/\\/g, "/").replace(/\?.*$/, "");
      if (!normalizedId.includes("node_modules/lucide-react") || !normalizedId.endsWith(".js")) return;
      const filePath = path.isAbsolute(id) ? id.replace(/\?.*$/, "") : path.resolve(id);
      try {
        if (!existsSync(filePath)) return;
        const code = readFileSync(filePath, "utf-8").replace(sourceMapCommentRegex, "");
        return { code, moduleType: "js" as const };
      } catch {
        return;
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  optimizeDeps: {
    // Exclude so esbuild doesn't pre-bundle and hit the broken vibrate-off.js.map
    exclude: ["lucide-react"],
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
      protocol: "ws",
      host: "localhost",
      port: 8080,
    },
    sourcemapIgnoreList: (sourcePath) => sourcePath.includes("node_modules"),
  },
  plugins: [
    stripLucideSourceMaps(),
    react(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
