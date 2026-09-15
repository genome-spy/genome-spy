/* global console */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
);
const distDir = path.join(packageDir, "dist");
const forbiddenFilePattern = /(?:^|\/)webgpu(?:-|\/)/i;
const forbiddenSourcePatterns = [
    /rendering\/webgpu/,
    /webgpu-renderer/,
    /createWebGpuRenderingBackend/,
];
const canvasImplementationMarker =
    "Unable to initialize a Canvas2D rendering context.";
const canvasFallbackMarker =
    "WebGL2 is unavailable. Using the Canvas2D compatibility renderer.";

const files = collectFiles(distDir);
const forbiddenFiles = files.filter((file) =>
    forbiddenFilePattern.test(path.relative(distDir, file))
);
const forbiddenSources = files
    .filter((file) => file.endsWith(".js"))
    .filter((file) => {
        const source = fs.readFileSync(file, "utf8");
        return forbiddenSourcePatterns.some((pattern) => pattern.test(source));
    });

if (forbiddenFiles.length || forbiddenSources.length) {
    const details = [
        ...forbiddenFiles.map(
            (file) => `file: ${path.relative(packageDir, file)}`
        ),
        ...forbiddenSources.map(
            (file) => `source: ${path.relative(packageDir, file)}`
        ),
    ].join("\n");
    throw new Error(
        `Production App bundle contains development-only WebGPU artifacts.\n${details}`
    );
}

verifyCanvasPackaging();

console.log("Production App bundle verification passed.");

function verifyCanvasPackaging() {
    const esmEntry = path.join(distDir, "index.es.js");
    const umdEntry = path.join(distDir, "index.js");
    const { staticModules, dynamicModules } = traceModuleGraph(esmEntry);

    if (findMarker(staticModules, canvasImplementationMarker)) {
        throw new Error(
            "Production App ESM entry includes the Canvas2D implementation synchronously."
        );
    }
    if (!findMarker(dynamicModules, canvasImplementationMarker)) {
        throw new Error(
            "Production App ESM entry does not dynamically include the Canvas2D implementation."
        );
    }
    if (!findMarker(staticModules, canvasFallbackMarker)) {
        throw new Error(
            "Production App ESM entry does not include the automatic Canvas2D fallback."
        );
    }

    const umdSource = fs.readFileSync(umdEntry, "utf8");
    if (!umdSource.includes(canvasImplementationMarker)) {
        throw new Error(
            "Production App UMD bundle does not include the Canvas2D implementation."
        );
    }
    if (!umdSource.includes(canvasFallbackMarker)) {
        throw new Error(
            "Production App UMD bundle does not include the automatic Canvas2D fallback."
        );
    }
}

/**
 * @param {string} entry
 * @returns {{staticModules: Set<string>, dynamicModules: Set<string>}}
 */
function traceModuleGraph(entry) {
    /** @type {[string, boolean][]} */
    const pending = [[entry, false]];
    const visited = new Set();
    const staticModules = new Set();
    const dynamicModules = new Set();

    while (pending.length) {
        const [file, crossedDynamicImport] = pending.pop();
        const visitKey = `${file}:${crossedDynamicImport}`;
        if (visited.has(visitKey)) {
            continue;
        }
        visited.add(visitKey);

        const source = fs.readFileSync(file, "utf8");
        (crossedDynamicImport ? dynamicModules : staticModules).add(file);

        for (const specifier of readStaticImports(source)) {
            pending.push([
                path.resolve(path.dirname(file), specifier),
                crossedDynamicImport,
            ]);
        }
        for (const specifier of readDynamicImports(source)) {
            pending.push([path.resolve(path.dirname(file), specifier), true]);
        }
    }

    return { staticModules, dynamicModules };
}

/** @param {string} source @returns {string[]} */
function readStaticImports(source) {
    const pattern =
        /^(?:import|export)\s+(?:[^\n]*?\sfrom\s+)?["'](\.\/[^"']+\.js)["'];?$/gm;
    return Array.from(source.matchAll(pattern), (match) => match[1]);
}

/** @param {string} source @returns {string[]} */
function readDynamicImports(source) {
    const pattern = /import\(\s*["'](\.\/[^"']+\.js)["']\s*\)/g;
    return Array.from(source.matchAll(pattern), (match) => match[1]);
}

/** @param {Set<string>} files @param {string} marker @returns {string | undefined} */
function findMarker(files, marker) {
    return Array.from(files).find((file) =>
        fs.readFileSync(file, "utf8").includes(marker)
    );
}

/** @param {string} directory @returns {string[]} */
function collectFiles(directory) {
    return fs
        .readdirSync(directory, { withFileTypes: true })
        .flatMap((entry) => {
            const file = path.join(directory, entry.name);
            return entry.isDirectory() ? collectFiles(file) : [file];
        });
}
