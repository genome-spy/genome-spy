import { defineConfig } from "vite";
import rawPlugin from "vite-raw-plugin";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
    plugins: [
        {
            ...rawPlugin({
                fileRegex: /\.glsl$/,
            }),
        },
    ],
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
