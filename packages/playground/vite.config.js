import { defineConfig } from "vite";
import rawPlugin from "vite-raw-plugin";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { generateExampleCatalog } from "./exampleCatalog.mjs";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(configDir, "..", "..");
const examplesDir = path.join(repoRoot, "examples");
const vegaDatasetsDir = path.join(
    repoRoot,
    "node_modules",
    "vega-datasets",
    "data"
);

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
                    "/examples/vega-datasets",
                    express.static(vegaDatasetsDir)
                );
                server.middlewares.use(
                    "/docs/examples/vega-datasets",
                    express.static(vegaDatasetsDir)
                );
                server.middlewares.use(
                    "/examples",
                    express.static(examplesDir)
                );
                server.middlewares.use(
                    "/docs/examples",
                    express.static(examplesDir)
                );
                server.middlewares.use("/example-catalog.json", (_req, res) => {
                    res.statusCode = 200;
                    res.setHeader("Content-Type", "application/json");
                    res.end(
                        JSON.stringify(
                            generateExampleCatalog(examplesDir, "/examples"),
                            null,
                            2
                        )
                    );
                });
            },
        },
        {
            name: "emit-example-catalog",
            apply: "build",

            generateBundle() {
                this.emitFile({
                    type: "asset",
                    fileName: "example-catalog.json",
                    source: JSON.stringify(
                        generateExampleCatalog(examplesDir, "/docs/examples"),
                        null,
                        2
                    ),
                });
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
