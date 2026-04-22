import { defineConfig } from "vite";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const process = globalThis.process;

export default defineConfig({
    envDir: dirname(fileURLToPath(import.meta.url)),
    root: "src",
    build: {
        outDir: "../dist",
        emptyOutDir: true,
        lib: {
            formats: ["umd", "es"],
            entry: "index.js",
            name: "genomeSpyAppAgent",
            fileName: (format) => `index.${format === "es" ? "es." : ""}js`,
        },
    },
    server: {
        host: process.env.HOST || "127.0.0.1",
    },
});
