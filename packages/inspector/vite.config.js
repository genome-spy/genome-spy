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
            // Inline the dependency-free button helper so direct browser imports
            // need no import map for a bare Core import. Keep the visualization
            // runtime external; the inspected embed supplies it through api.debug.
            external: (id) =>
                id !== "@genome-spy/core/controls/button.js" &&
                /^@genome-spy\/(app|core)(\/.*)?$/.test(id),
        },
    },
}));
