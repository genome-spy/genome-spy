import { defineConfig } from "vite";
import rawPlugin from "vite-raw-plugin";
import replace from "@rollup/plugin-replace";
import { createAppDevServerPlugin } from "../../devServerRoutes.mjs";

const process = globalThis.process;

export default defineConfig({
    root: "src",
    appType: "mpa",
    server: {
        host: process.env.HOST || "127.0.0.1",
        port: 8080,
        strictPort: true,
    },
    test: {
        setupFiles: ["src/testSetup.js"],
    },
    plugins: [
        createAppDevServerPlugin(),
        // Don't minify
        {
            ...rawPlugin({
                fileRegex: /\.glsl$/,
            }),
        },
    ],
    define: {
        // A hack needed by events package
        global: "globalThis",
    },
    build: {
        outDir: "../dist",
        emptyOutDir: true,
        lib: {
            formats: ["umd", "es"],
            entry: "index.js",
            name: "genomeSpyApp",
            cssFileName: "style",
            fileName: (format) => `index.${format === "es" ? "es." : ""}js`,
        },
        rollupOptions: {
            plugins: [
                // Replace is needed by redux. Maybe a different redux build
                // should be used in production.
                replace({
                    "process.env.NODE_ENV": JSON.stringify("production"),
                }),
            ],
        },
    },
});
