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
            fileName: (format) => `index.${format === "es" ? "es." : ""}js`,
        },
        rollupOptions: {
            plugins: [
                // Replace is needed by redux. Maybe a different redux build
                // should be used in production.
                replace({
                    "process.env.NODE_ENV": JSON.stringify("production"),
                }),
                minifyHTML.default(),
            ],
        },
    },
});
