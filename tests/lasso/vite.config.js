import { defineConfig } from "vite";
import express from "express";
import { fileURLToPath } from "node:url";
import rawPlugin from "vite-raw-plugin";

export default defineConfig({
    root: fileURLToPath(new URL(".", import.meta.url)),
    publicDir: false,
    appType: "mpa",
    resolve: { conditions: ["development"] },
    server: { host: "127.0.0.1", port: 5174, strictPort: true },
    plugins: [
        rawPlugin({ fileRegex: /\.(txt|glsl)$/ }),
        {
            name: "lasso-private-data",
            configureServer(server) {
                server.middlewares.use(
                    "/private",
                    express.static(
                        fileURLToPath(new URL("../../private", import.meta.url))
                    )
                );
            },
        },
    ],
    define: { global: "globalThis" },
});
