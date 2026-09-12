import process from "node:process";
import { defineConfig } from "vite";
import rawPlugin from "vite-raw-plugin";

export default defineConfig({
    root: "src",
    base: process.env.EMBED_EXAMPLES_BASE ?? "/",
    resolve: {
        conditions: ["development"],
        // The React wrapper is imported from a linked workspace package.
        // Dedupe keeps the example on a single React instance.
        dedupe: ["react", "react-dom"],
    },
    build: {
        outDir: "../dist",
        emptyOutDir: true,
        rollupOptions: {
            // Build every example page so refactors break CI instead of the examples site.
            input: {
                index: "index.html",
                "scaleApi/index": "scaleApi/index.html",
                "paramApi/index": "paramApi/index.html",
                "brushLinkingApi/index": "brushLinkingApi/index.html",
                "viewMutationApi/index": "viewMutationApi/index.html",
                "inspectorOverlay/index": "inspectorOverlay/index.html",
                "controls/index": "controls/index.html",
                "linkedEmbeds/index": "linkedEmbeds/index.html",
                "dynamicNamedData/index": "dynamicNamedData/index.html",
                "multipleDynamicSources/index":
                    "multipleDynamicSources/index.html",
                "namedDataForm/index": "namedDataForm/index.html",
                "dynamicSequenceSource/index":
                    "dynamicSequenceSource/index.html",
                "sequenceEditor/index": "sequenceEditor/index.html",
                "reactComponent/index": "reactComponent/index.html",
                "annotationEditor/index": "annotationEditor/index.html",
                "selectionForm/index": "selectionForm/index.html",
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
