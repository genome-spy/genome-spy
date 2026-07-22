import { defineConfig } from "vite";
import rawPlugin from "vite-raw-plugin";

export default defineConfig({
    define: {
        "process.env.NODE_ENV": JSON.stringify("production"),
    },
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
    },
});
