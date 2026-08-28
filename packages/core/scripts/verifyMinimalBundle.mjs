/* global console, process */

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
const webGlRenderingDirectory = "src/rendering/webgl/";
const webGpuRenderingDirectory = "src/rendering/webgpu/";
const rendererRegistrationSources = [
    "src/rendering/registerCanvas.js",
    "src/rendering/registerSvg.js",
    "src/rendering/registerWebGL.js",
];

const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "genome-spy-minimal-bundle-")
);
const minimalOutDir = path.join(tempDir, "minimal");
const productionOutDir = path.join(tempDir, "production");

try {
    verifyImmediateRenderingImports();

    const minimalOutput = await buildEntry(
        "minimal.js",
        "genomeSpyEmbedMinimal",
        minimalOutDir
    );
    const minimalSources = readStaticEntrySources(minimalOutput, "minimal.js");

    for (const forbidden of forbiddenSources) {
        if (minimalSources.some((source) => source.endsWith(forbidden))) {
            throw new Error(
                `Minimal bundle should not include ${forbidden}, but it does.`
            );
        }
    }

    verifyNoOptionalRendererSources(
        readAllOutputSources(minimalOutput),
        "Minimal bundle"
    );

    const productionOutput = await buildEntry(
        "index.js",
        "genomeSpyEmbed",
        productionOutDir
    );
    const productionSources = readStaticEntrySources(
        productionOutput,
        "index.js"
    );
    verifyNoStaticWebGLSources(
        productionSources,
        "Synchronous production entry"
    );
    for (const forbidden of optionalRenderingDirectories) {
        if (productionSources.some((source) => source.includes(forbidden))) {
            throw new Error(
                `Synchronous production entry should not include ${forbidden}, but it does.`
            );
        }
    }

    const productionBundleSources = readAllOutputSources(productionOutput);
    if (
        productionBundleSources.some((source) =>
            source.includes(webGpuRenderingDirectory)
        )
    ) {
        throw new Error(
            `Production bundle should not include ${webGpuRenderingDirectory}, but it does.`
        );
    }
    verifyDynamicRendererChunks(productionOutput, "index.js", {
        name: "WebGL",
        directory: webGlRenderingDirectory,
        isImplementationSource: isWebGLImplementationSource,
    });
    verifyDynamicRendererChunks(productionOutput, "index.js", {
        name: "Canvas2D",
        directory: "src/rendering/canvas2d/",
    });
    verifyDynamicRendererChunks(productionOutput, "index.js", {
        name: "SVG",
        directory: "src/rendering/svg/",
    });

    console.log("Minimal bundle verification passed.");
} finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
}

/**
 * @param {Array<import("rollup").OutputChunk | import("rollup").OutputAsset>} output
 * @param {string} entry
 */
function readStaticEntrySources(output, entry) {
    const chunks = output.filter((item) => item.type == "chunk");
    const chunksByFileName = new Map(
        chunks.map((chunk) => [chunk.fileName, chunk])
    );
    const entryChunk = chunks.find((chunk) => chunk.isEntry);
    if (!entryChunk) {
        throw new Error(`Build for ${entry} did not produce an entry chunk.`);
    }

    const sources = new Set();
    const visitedChunks = new Set();

    /** @param {import("rollup").OutputChunk} chunk */
    function visitStaticImports(chunk) {
        if (visitedChunks.has(chunk.fileName)) {
            return;
        }
        visitedChunks.add(chunk.fileName);

        for (const source of Object.keys(chunk.modules)) {
            sources.add(source.replaceAll("\\", "/"));
        }
        for (const importedFile of chunk.imports) {
            const importedChunk = chunksByFileName.get(importedFile);
            if (importedChunk) {
                visitStaticImports(importedChunk);
            }
        }
    }

    visitStaticImports(entryChunk);
    return Array.from(sources);
}

/**
 * @param {Array<import("rollup").OutputChunk | import("rollup").OutputAsset>} output
 */
function readAllOutputSources(output) {
    return output
        .filter((item) => item.type == "chunk")
        .flatMap((chunk) => Object.keys(chunk.modules))
        .map((source) => source.replaceAll("\\", "/"));
}

/**
 * @param {string[]} sources
 * @param {string} owner
 */
function verifyNoStaticWebGLSources(sources, owner) {
    const source = sources.find(isWebGLImplementationSource);
    if (source) {
        throw new Error(
            `${owner} should not include WebGL, TWGL, or GLSL sources, but includes ${source}.`
        );
    }
}

/**
 * @param {Array<import("rollup").OutputChunk | import("rollup").OutputAsset>} output
 * @param {string} entry
 * @param {{name: string, directory: string, isImplementationSource?: (source: string) => boolean}} options
 */
function verifyDynamicRendererChunks(output, entry, options) {
    const chunks = output.filter((item) => item.type == "chunk");
    const chunksByFileName = new Map(
        chunks.map((chunk) => [chunk.fileName, chunk])
    );
    const entryChunk = chunks.find((chunk) => chunk.isEntry);
    if (!entryChunk) {
        throw new Error(`Build for ${entry} did not produce an entry chunk.`);
    }

    const dynamicallyReachable = new Set();
    const visited = new Set();

    /**
     * @param {import("rollup").OutputChunk} chunk
     * @param {boolean} crossedDynamicImport
     */
    function visit(chunk, crossedDynamicImport) {
        const visitKey = `${chunk.fileName}:${crossedDynamicImport}`;
        if (visited.has(visitKey)) {
            return;
        }
        visited.add(visitKey);

        if (crossedDynamicImport) {
            dynamicallyReachable.add(chunk.fileName);
        }
        for (const importedFile of chunk.imports) {
            const importedChunk = chunksByFileName.get(importedFile);
            if (importedChunk) {
                visit(importedChunk, crossedDynamicImport);
            }
        }
        for (const importedFile of chunk.dynamicImports) {
            const importedChunk = chunksByFileName.get(importedFile);
            if (importedChunk) {
                visit(importedChunk, true);
            }
        }
    }

    visit(entryChunk, false);

    const isImplementationSource =
        options.isImplementationSource ??
        ((source) => normalizeSource(source).includes(options.directory));
    const rendererChunks = chunks.filter((chunk) =>
        Object.keys(chunk.modules)
            .map(normalizeSource)
            .some(isImplementationSource)
    );
    if (!rendererChunks.length) {
        throw new Error(
            `Build for ${entry} did not contain a ${options.name} chunk.`
        );
    }

    const factoryChunk = rendererChunks.find((chunk) =>
        Object.keys(chunk.modules)
            .map(normalizeSource)
            .some((source) => source.endsWith(options.directory + "index.js"))
    );
    if (!factoryChunk) {
        throw new Error(
            `Build for ${entry} did not contain ${options.directory}index.js.`
        );
    }
    if (!dynamicallyReachable.has(factoryChunk.fileName)) {
        throw new Error(
            `${options.name} factory chunk ${factoryChunk.fileName} is not dynamically reachable from ${entry}.`
        );
    }

    const unreachableChunk = rendererChunks.find(
        (chunk) => !dynamicallyReachable.has(chunk.fileName)
    );
    if (unreachableChunk) {
        throw new Error(
            `${options.name} implementation chunk ${unreachableChunk.fileName} is not behind a dynamic import.`
        );
    }
}

/**
 * @param {string[]} sources
 * @param {string} owner
 */
function verifyNoOptionalRendererSources(sources, owner) {
    const forbiddenDirectories = [
        ...optionalRenderingDirectories,
        webGlRenderingDirectory,
        webGpuRenderingDirectory,
    ];
    const source = sources.find(
        (source) =>
            forbiddenDirectories.some((directory) =>
                source.includes(directory)
            ) ||
            rendererRegistrationSources.some((registration) =>
                source.endsWith(registration)
            ) ||
            isWebGLImplementationSource(source)
    );
    if (source) {
        throw new Error(
            `${owner} should not include optional renderer sources, but includes ${source}.`
        );
    }
}

/** @param {string} source */
function isWebGLImplementationSource(source) {
    const normalized = normalizeSource(source);
    return (
        normalized.includes(webGlRenderingDirectory) ||
        /\/twgl\.js(?:\/|$)/.test(normalized) ||
        /\.glsl(?:\.js)?(?:\?|$)/.test(normalized)
    );
}

/** @param {string} source */
function normalizeSource(source) {
    return source.replaceAll("\\", "/");
}

/**
 * @param {string} entry
 * @param {string} name
 * @param {string} outDir
 */
async function buildEntry(entry, name, outDir) {
    const buildResult = await build({
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

    return Array.isArray(buildResult)
        ? buildResult.flatMap((result) => result.output)
        : buildResult.output;
}

function verifyImmediateRenderingImports() {
    const immediateDir = path.resolve("src/rendering/immediate");
    const prohibitedDirectories = ["canvas2d", "svg", "webgl", "webgpu"].map(
        (name) => path.resolve("src/rendering", name)
    );
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
