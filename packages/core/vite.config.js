import { defineConfig } from "vite";
import rawPlugin from "vite-raw-plugin";
import minifyHTML from "rollup-plugin-minify-html-literals";
import glsl from "rollup-plugin-glsl";

export default defineConfig({
    root: "src",
    plugins: [
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
        outDir: "../dist",
        emptyOutDir: true,
        lib: {
            formats: ["umd", "es"],
            entry: "index.js",
            name: "genomeSpyEmbed",
            fileName: (format) =>
                format == "umd" ? "index.js" : `index.${format}.js`,
        },
        rollupOptions: {
            plugins: [minifyHTML()],
        },
    },
});
