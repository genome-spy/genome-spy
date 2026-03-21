import { defineConfig } from "vite";
import rawPlugin from "vite-raw-plugin";

export default defineConfig({
    root: "src",
    build: {
        outDir: "../dist",
        emptyOutDir: true,
        rollupOptions: {
            // Build every example page so refactors break CI instead of the examples site.
            input: {
                index: "src/index.html",
                scaleApi: "src/scaleApi.html",
                dynamicNamedData: "src/dynamicNamedData.html",
                multipleDynamicSources: "src/multipleDynamicSources.html",
                namedDataProvider: "src/namedDataProvider.html",
                dynamicFasta: "src/dynamicFasta.html",
                reactComponent: "src/reactComponent.html",
            },
        },
    },
    plugins: [
        rawPlugin({
            fileRegex: /\.(txt|glsl)$/,
        }),
    ],
    define: {
        // A hack needed by events package
        global: "globalThis",
    },
});
