import { defineConfig } from "vite";
import rawPlugin from "vite-raw-plugin";
import minifyHTML from "rollup-plugin-minify-html-literals";

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
            name: "genomeSpyEmbed",
            fileName: () => "index.js",
        },
        rollupOptions: {
            plugins: [minifyHTML()],
        },
    },
});
