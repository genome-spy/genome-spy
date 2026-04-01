/* eslint-disable no-sync */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { build } from "vite";
import glsl from "rollup-plugin-glsl";
import rawPlugin from "vite-raw-plugin";

const forbiddenSources = [
    "src/genomeSpy.js",
    "src/data/formats/parquet.js",
    "src/data/formats/bed.js",
    "src/data/formats/bedpe.js",
    "src/data/formats/fasta.js",
    "src/data/sources/lazy/registerBuiltInLazySources.js",
    "src/data/sources/lazy/indexedFastaSource.js",
    "src/data/sources/lazy/bigWigSource.js",
    "src/data/sources/lazy/bigBedSource.js",
    "src/data/sources/lazy/bamSource.js",
    "src/data/sources/lazy/gff3Source.js",
    "src/data/sources/lazy/vcfSource.js",
];

const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "genome-spy-minimal-bundle-")
);
const outDir = path.join(tempDir, "dist");

try {
    await build({
        root: "src",
        plugins: [
            {
                ...rawPlugin({
                    fileRegex: /\.glsl$/,
                }),
                apply: "serve",
            },
            {
                ...glsl({
                    include: "**/*.glsl",
                }),
                apply: "build",
            },
        ],
        define: {
            global: "globalThis",
        },
        build: {
            outDir,
            emptyOutDir: true,
            sourcemap: true,
            lib: {
                formats: ["es"],
                entry: "minimal.js",
                name: "genomeSpyEmbedMinimal",
                fileName: (format) =>
                    format == "umd" ? "index.js" : `index.${format}.js`,
            },
            rollupOptions: {},
        },
    });

    const mapPath = path.join(outDir, "index.es.js.map");
    const sourceMap = JSON.parse(fs.readFileSync(mapPath, "utf8"));
    const sources = sourceMap.sources.map((source) =>
        source.replaceAll("\\", "/")
    );

    for (const forbidden of forbiddenSources) {
        if (sources.some((source) => source.endsWith(forbidden))) {
            throw new Error(
                `Minimal bundle should not include ${forbidden}, but it does.`
            );
        }
    }

    console.log("Minimal bundle verification passed.");
} finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
}
