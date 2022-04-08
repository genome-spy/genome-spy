import { defineConfig } from "vite";
import rawPlugin from "vite-raw-plugin";

export default defineConfig({
    root: "src",
    base: "",
    plugins: [
        rawPlugin({
            fileRegex: /\.glsl$/,
        }),
    ],
    build: {
        outDir: "../dist",
        emptyOutDir: true,
    },
});
