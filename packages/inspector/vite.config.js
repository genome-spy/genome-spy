import { defineConfig } from "vite";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { visualizer } from "rollup-plugin-visualizer";

const process = globalThis.process;
const packageDir = dirname(fileURLToPath(import.meta.url));
const packagesDir = dirname(packageDir);
const repoRoot = dirname(packagesDir);

export default defineConfig(({ command }) => ({
    envDir: packageDir,
    root: "src",
    resolve: {
        conditions: command === "serve" ? ["development"] : [],
    },
    server: {
        host: process.env.HOST || "127.0.0.1",
        fs: {
            allow: [repoRoot],
        },
    },
    plugins: [visualizer()],
    build: {
        outDir: "../dist",
        emptyOutDir: true,
        lib: {
            formats: ["es"],
            entry: "index.js",
            fileName: (format) => `index.${format === "es" ? "es." : ""}js`,
        },
        rollupOptions: {
            external: [
                /^@genome-spy\/app(\/.*)?$/,
                /^@genome-spy\/core(\/.*)?$/,
            ],
        },
    },
}));
