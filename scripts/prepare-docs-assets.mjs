import { access, cp, mkdir, rm } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Centralized docs asset staging for both local builds and CI.
// This keeps schema/docs copy behavior in one place instead of shell snippets.
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

// Build outputs that must exist before docs can be built.
const docEmbedDistDir = path.join(repoRoot, "packages", "doc-embed", "dist");
const coreSchemaSource = path.join(
    repoRoot,
    "packages",
    "core",
    "dist",
    "schema.json"
);
const appSchemaSource = path.join(
    repoRoot,
    "packages",
    "app",
    "dist",
    "schema.json"
);

// Files that MkDocs and the custom markdown extension consume.
const docsDir = path.join(repoRoot, "docs");
const docsAppDir = path.join(docsDir, "app");
const coreSchemaTarget = path.join(docsDir, "schema.json");
const appSchemaTarget = path.join(docsDir, "app-schema.json");

/**
 * @param {string} sourcePath
 */
async function ensureReadable(sourcePath) {
    try {
        await access(sourcePath, constants.R_OK);
    } catch {
        throw new Error(
            "Missing required docs input: " +
                sourcePath +
                ". Run the corresponding build step before preparing docs assets."
        );
    }
}

// Fail fast with a clear message if prerequisites are missing.
await ensureReadable(docEmbedDistDir);
await ensureReadable(coreSchemaSource);
await ensureReadable(appSchemaSource);

// Replace staged docs assets atomically to avoid stale files from older builds.
await mkdir(docsDir, { recursive: true });
await rm(docsAppDir, { recursive: true, force: true });
await cp(docEmbedDistDir, docsAppDir, { recursive: true });
await cp(coreSchemaSource, coreSchemaTarget);
await cp(appSchemaSource, appSchemaTarget);

console.log("Prepared docs assets in docs/.");
