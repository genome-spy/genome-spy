import { defineConfig } from "vite";
import rawPlugin from "vite-raw-plugin";

export default defineConfig({
    root: "src",
    plugins: [
        rawPlugin({
            fileRegex: /\.(txt|glsl)$/,
        }),
    ],
});
