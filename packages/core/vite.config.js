import { defineConfig } from "vite";
import path from "path";
import rawPlugin from "vite-raw-plugin";
import glsl from "rollup-plugin-glsl";
import { fileURLToPath } from "url";
import { createCoreDevServerPlugin } from "../../devServerRoutes.mjs";

const process = globalThis.process;
const screenshotPagePath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "screenshot.html"
);

export default defineConfig({
    root: "src",
    appType: "mpa",
    server: {
        host: process.env.HOST || "127.0.0.1",
        port: Number(process.env.PORT || 8080),
        strictPort: true,
    },
    test: {
        setupFiles: ["src/testSetup.js"],
    },
    plugins: [
        createCoreDevServerPlugin(screenshotPagePath),
        // Don't minify
        {
            ...rawPlugin({
                fileRegex: /\.glsl$/,
            }),
            apply: "serve",
        },
        // Please minify
        {
            ...glsl({
                include: "**/*.glsl",
            }),
            apply: "build",
        },
    ],
    define: {
        // A hack needed by events package
        global: "globalThis",
    },
    build: {
        outDir: "../dist/bundle",
        emptyOutDir: true,
        lib: {
            formats: ["umd", "es"],
            entry: "index.js",
            name: "genomeSpyEmbed",
            fileName: (format) =>
                format == "umd" ? "index.js" : `index.${format}.js`,
        },
        rollupOptions: {},
    },
});
