import { defineConfig } from "vite";
import rawPlugin from "vite-raw-plugin";
import minifyHTML from "rollup-plugin-minify-html-literals";
import replace from "@rollup/plugin-replace";

export default defineConfig({
    root: "src",
    plugins: [
        // Don't minify
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
            formats: ["umd"],
            entry: "index.js",
            name: "genomeSpyApp",
            fileName: () => "index.js",
        },
        rollupOptions: {
            plugins: [
                // Replace is needed by redux. Maybe a different redux build
                // should be used in production.
                replace({
                    "process.env.NODE_ENV": JSON.stringify("production"),
                }),
                minifyHTML(),
            ],
        },
    },
});
