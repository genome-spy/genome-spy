import { defineConfig } from "vite";
import rawPlugin from "vite-raw-plugin";

export default defineConfig({
    root: "src",
    plugins: [
        rawPlugin({
            fileRegex: /\.(txt|glsl)$/,
        }),
    ],
    build: {
        outDir: "../dist",
        emptyOutDir: true,
        dedupe: ["lit", "vega-loader"],
    },
});
