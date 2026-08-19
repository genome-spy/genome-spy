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
    "src/data/formats/arrow.js",
    "src/data/formats/bed.js",
    "src/data/formats/bedpe.js",
    "src/data/formats/fasta.js",
    "src/data/formats/wig.js",
    "src/data/formats/vcf.js",
    "src/data/sources/lazy/registerBuiltInLazySources.js",
    "src/data/sources/lazy/indexedFastaSource.js",
    "src/data/sources/lazy/bigWigSource.js",
    "src/data/sources/lazy/bigBedSource.js",
    "src/data/sources/lazy/bamSource.js",
    "src/data/sources/lazy/gff3Source.js",
    "src/data/sources/lazy/vcfSource.js",
];

const optionalRenderingDirectories = [
    "src/rendering/canvas2d/",
    "src/rendering/immediate/",
    "src/rendering/svg/",
];

const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "genome-spy-minimal-bundle-")
);
const minimalOutDir = path.join(tempDir, "minimal");
const productionOutDir = path.join(tempDir, "production");

try {
    verifyImmediateRenderingImports();

    const minimalSources = await buildAndReadEntrySources(
        "minimal.js",
        "genomeSpyEmbedMinimal",
        minimalOutDir
    );

    for (const forbidden of forbiddenSources) {
        if (minimalSources.some((source) => source.endsWith(forbidden))) {
            throw new Error(
                `Minimal bundle should not include ${forbidden}, but it does.`
            );
        }
    }

    for (const forbidden of optionalRenderingDirectories) {
        if (minimalSources.some((source) => source.includes(forbidden))) {
            throw new Error(
                `Minimal bundle should not include ${forbidden}, but it does.`
            );
        }
    }

    const productionSources = await buildAndReadEntrySources(
        "index.js",
        "genomeSpyEmbed",
        productionOutDir
    );
    for (const forbidden of optionalRenderingDirectories) {
        if (productionSources.some((source) => source.includes(forbidden))) {
            throw new Error(
                `Synchronous production entry should not include ${forbidden}, but it does.`
            );
        }
    }

    console.log("Minimal bundle verification passed.");
} finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
}

/**
 * @param {string} entry
 * @param {string} name
 * @param {string} outDir
 */
async function buildAndReadEntrySources(entry, name, outDir) {
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
                entry,
                name,
                fileName: (format) =>
                    format == "umd" ? "index.js" : `index.${format}.js`,
            },
            rollupOptions: {},
        },
    });

    const mapPath = path.join(outDir, "index.es.js.map");
    const sourceMap = JSON.parse(fs.readFileSync(mapPath, "utf8"));
    return sourceMap.sources.map((source) => source.replaceAll("\\", "/"));
}

function verifyImmediateRenderingImports() {
    const immediateDir = path.resolve("src/rendering/immediate");
    const prohibitedDirectories = ["canvas2d", "svg", "webgpu"]
        .map((name) => path.resolve("src/rendering", name))
        .concat(path.resolve("src/gl"));
    const importPattern = /(?:from\s+|import\s*\()["']([^"']+)["']/g;

    for (const file of listJavaScriptFiles(immediateDir)) {
        const source = fs.readFileSync(file, "utf8");
        for (const match of source.matchAll(importPattern)) {
            const specifier = match[1];
            if (!specifier.startsWith(".")) {
                continue;
            }
            const target = path.resolve(path.dirname(file), specifier);
            const prohibited = prohibitedDirectories.find(
                (directory) =>
                    target == directory ||
                    target.startsWith(directory + path.sep)
            );
            if (prohibited) {
                throw new Error(
                    `${path.relative(process.cwd(), file)} imports backend-specific ${path.relative(process.cwd(), target)}.`
                );
            }
        }
    }
}

/** @param {string} directory */
function listJavaScriptFiles(directory) {
    return fs
        .readdirSync(directory, { withFileTypes: true })
        .flatMap((entry) => {
            const file = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                return listJavaScriptFiles(file);
            } else {
                return file.endsWith(".js") ? [file] : [];
            }
        });
}
