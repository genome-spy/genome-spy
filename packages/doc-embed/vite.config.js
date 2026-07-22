import { defineConfig } from "vite";
import rawPlugin from "vite-raw-plugin";

export default defineConfig({
    resolve: {
        conditions: ["development"],
        dedupe: ["lit"],
    },
    plugins: [
        rawPlugin({
            fileRegex: /\.(glsl)$/,
        }),
    ],
    build: {
        outDir: "dist",
        emptyOutDir: true,
        lib: {
            formats: ["es"],
            entry: "index.js",
            fileName: () => "index.js",
        },
    },
});
