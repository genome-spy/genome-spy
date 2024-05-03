import { resolve } from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import dts from "vite-plugin-dts";
import rawPlugin from "vite-raw-plugin";

export default defineConfig({
    plugins: [
        rawPlugin({ fileRegex: /\.glsl$/ }),
        react(),
        dts({ include: ["src/**/*.ts", "src/**/*.tsx"] }),
    ],
    build: {
        lib: {
            entry: resolve(__dirname, "src/main.tsx"),
            name: "react-component",
        },
        rollupOptions: {
            external: ["react", "react/jsx-runtime", "@genome-spy/core"],
            output: {
                globals: {
                    react: "React",
                },
            },
        },
    },
});
