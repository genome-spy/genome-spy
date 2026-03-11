import { defineConfig } from "vite";
import rawPlugin from "vite-raw-plugin";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(configDir, "..", "..");
const examplesDir = path.join(repoRoot, "examples");

export default defineConfig({
    root: "src",
    base: "",
    plugins: [
        rawPlugin({
            fileRegex: /\.glsl$/,
        }),
        {
            name: "serve-shared-examples",

            configureServer(server) {
                server.middlewares.use(
                    "/examples",
                    express.static(examplesDir)
                );
                server.middlewares.use(
                    "/docs/examples",
                    express.static(examplesDir)
                );
            },
        },
    ],
    define: {
        // A hack needed by events package
        global: "globalThis",
    },
    build: {
        outDir: "../dist",
        emptyOutDir: true,
    },
});
