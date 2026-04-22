import { defineConfig } from "vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const process = globalThis.process;
const packageDir = dirname(fileURLToPath(import.meta.url));
const packagesDir = dirname(packageDir);
const repoRoot = dirname(packagesDir);

export default defineConfig(({ command }) => ({
    envDir: packageDir,
    root: "src",
    resolve: {
        alias:
            command === "serve"
                ? {
                      "@genome-spy/app": resolve(
                          repoRoot,
                          "packages/app/src/index.js"
                      ),
                      "@genome-spy/app/agentApi": resolve(
                          repoRoot,
                          "packages/app/src/agentApi/index.js"
                      ),
                      "@genome-spy/app/agentShared": resolve(
                          repoRoot,
                          "packages/app/src/agentShared/index.js"
                      ),
                      "@genome-spy/app/dialog": resolve(
                          repoRoot,
                          "packages/app/src/dialog/index.js"
                      ),
                  }
                : {},
    },
    optimizeDeps:
        command === "serve"
            ? {
                  exclude: [
                      "@genome-spy/app",
                      "@genome-spy/app/agentApi",
                      "@genome-spy/app/agentShared",
                      "@genome-spy/app/dialog",
                  ],
              }
            : undefined,
    server: {
        host: process.env.HOST || "127.0.0.1",
        fs: {
            allow: [repoRoot],
        },
    },
    build: {
        outDir: "../dist",
        emptyOutDir: true,
        lib: {
            formats: ["umd", "es"],
            entry: "index.js",
            name: "genomeSpyAppAgent",
            fileName: (format) => `index.${format === "es" ? "es." : ""}js`,
        },
    },
}));
