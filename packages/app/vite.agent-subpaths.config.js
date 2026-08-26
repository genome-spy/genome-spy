import { defineConfig } from "vite";
import rawPlugin from "vite-raw-plugin";
import replace from "@rollup/plugin-replace";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const process = globalThis.process;
const packageDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(packageDir, "..", "..");

export default defineConfig({
    envDir: packageDir,
    root: "src",
    resolve: {
        conditions: [],
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
    define: {
        global: "globalThis",
        // These are production-only package entry points, including in tests.
        "import.meta.env.DEV": JSON.stringify(false),
    },
    build: {
        outDir: "../dist",
        emptyOutDir: false,
        lib: {
            formats: ["es"],
            entry: {
                agentApi: "agentApi/index.js",
                agentShared: "agentShared/index.js",
                dialog: "dialog/index.js",
            },
            fileName: (_format, entryName) => `${entryName}.es.js`,
        },
        rollupOptions: {
            plugins: [
                replace({
                    preventAssignment: true,
                    "process.env.NODE_ENV": JSON.stringify("production"),
                }),
            ],
        },
    },
});
