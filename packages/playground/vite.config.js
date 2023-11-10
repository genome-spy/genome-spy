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
    define: {
        // A hack needed by events package
        global: "globalThis",
    },
    build: {
        outDir: "../dist",
        emptyOutDir: true,
    },
});
