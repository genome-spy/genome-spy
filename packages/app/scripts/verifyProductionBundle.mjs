/* global console */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(packageDir, "dist");
const forbiddenFilePattern = /(?:^|\/)webgpu(?:-|\/)/i;
const forbiddenSourcePatterns = [
    /rendering\/webgpu/,
    /webgpu-renderer/,
    /createWebGpuRenderingBackend/,
];

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
        ...forbiddenFiles.map((file) => `file: ${path.relative(packageDir, file)}`),
        ...forbiddenSources.map(
            (file) => `source: ${path.relative(packageDir, file)}`
        ),
    ].join("\n");
    throw new Error(
        `Production App bundle contains development-only WebGPU artifacts.\n${details}`
    );
}

console.log("Production App bundle verification passed.");

/** @param {string} directory @returns {string[]} */
function collectFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const file = path.join(directory, entry.name);
        return entry.isDirectory() ? collectFiles(file) : [file];
    });
}
