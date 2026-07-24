import { defineConfig } from "vite";
import rawPlugin from "vite-raw-plugin";
import replace from "@rollup/plugin-replace";

export default defineConfig({
    resolve: {
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
        rollupOptions: {
            plugins: [
                replace({
                    "process.env.NODE_ENV": JSON.stringify("production"),
                }),
            ],
        },
    },
});
