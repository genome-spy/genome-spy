import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const packageDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(packageDir, "..", "..", "..", "..");

const sharedExampleDirs = ["examples/core", "examples/docs"];

/**
 * Collects shared example specs used by the offline example suite.
 *
 * @returns {string[]}
 */
export function collectSharedExamplePaths() {
    /** @type {string[]} */
    const paths = [];

    for (const dir of sharedExampleDirs) {
        visit(path.join(repoRoot, dir), (absolutePath) => {
            const relativePath = path.relative(repoRoot, absolutePath);
            paths.push(relativePath.split(path.sep).join("/"));
        });
    }

    return paths.sort();
}

/**
 * @param {string} examplePath
 * @returns {any}
 */
export function loadSharedExampleSpec(examplePath) {
    return JSON.parse(
        fs.readFileSync(path.join(repoRoot, examplePath), "utf8")
    );
}

/**
 * @param {string} dir
 * @param {(absolutePath: string) => void} visitor
 */
function visit(dir, visitor) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const absolutePath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            visit(absolutePath, visitor);
        } else if (entry.isFile() && entry.name.endsWith(".json")) {
            visitor(absolutePath);
        }
    }
}
