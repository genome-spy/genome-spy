import { defineConfig } from "vite";
import rawPlugin from "vite-raw-plugin";

export default defineConfig({
    root: "src",
    plugins: [
        rawPlugin({
            fileRegex: /\.glsl$/,
        }),
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
    },
});
