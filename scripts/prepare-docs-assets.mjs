import { access, cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
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
const corePackageSource = path.join(
    repoRoot,
    "packages",
    "core",
    "package.json"
);
const appPackageSource = path.join(
    repoRoot,
    "packages",
    "app",
    "package.json"
);

// Files that MkDocs and the custom markdown extension consume.
const docsDir = path.join(repoRoot, "docs");
const docsAppDir = path.join(docsDir, "app");
const docsExamplesDir = path.join(docsDir, "examples");
const docsSnippetTemplatesDir = path.join(docsDir, "snippets-src");
const docsGeneratedSnippetsDir = path.join(docsDir, "generated-snippets");
const coreSchemaTarget = path.join(docsDir, "schema.json");
const appSchemaTarget = path.join(docsDir, "app-schema.json");
const examplesSourceDir = path.join(repoRoot, "examples");

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

/**
 * @param {string} sourceDir
 * @returns {Promise<string[]>}
 */
async function getSnippetTemplateFiles(sourceDir) {
    /** @type {string[]} */
    const files = [];
    const entries = await readdir(sourceDir, { withFileTypes: true });

    for (const entry of entries) {
        const sourcePath = path.join(sourceDir, entry.name);
        if (entry.isDirectory()) {
            files.push(...(await getSnippetTemplateFiles(sourcePath)));
        } else {
            files.push(sourcePath);
        }
    }

    return files;
}

/**
 * @param {Record<string, string>} replacements
 * @param {string} content
 */
function renderSnippetTemplate(replacements, content) {
    return Object.entries(replacements).reduce(
        (rendered, [key, value]) => rendered.replaceAll(`{{${key}}}`, value),
        content
    );
}

/**
 * @param {string} sourcePath
 */
function includeDocsAsset(sourcePath) {
    return path.basename(sourcePath) !== "README.md";
}

// Fail fast with a clear message if prerequisites are missing.
await ensureReadable(docEmbedDistDir);
await ensureReadable(coreSchemaSource);
await ensureReadable(appSchemaSource);
await ensureReadable(corePackageSource);
await ensureReadable(appPackageSource);
await ensureReadable(examplesSourceDir);
await ensureReadable(docsSnippetTemplatesDir);

const corePackage = JSON.parse(await readFile(corePackageSource, "utf8"));
const appPackage = JSON.parse(await readFile(appPackageSource, "utf8"));

const snippetReplacements = {
    CORE_VERSION: corePackage.version,
    APP_VERSION: appPackage.version,
};

// Replace staged docs assets atomically to avoid stale files from older builds.
await mkdir(docsDir, { recursive: true });
await rm(docsAppDir, { recursive: true, force: true });
await rm(docsExamplesDir, { recursive: true, force: true });
await rm(docsGeneratedSnippetsDir, { recursive: true, force: true });
await cp(docEmbedDistDir, docsAppDir, { recursive: true });
await cp(examplesSourceDir, docsExamplesDir, {
    recursive: true,
    filter: includeDocsAsset,
});
await cp(coreSchemaSource, coreSchemaTarget);
await cp(appSchemaSource, appSchemaTarget);

for (const sourcePath of await getSnippetTemplateFiles(docsSnippetTemplatesDir)) {
    const relativePath = path.relative(docsSnippetTemplatesDir, sourcePath);
    const targetPath = path.join(docsGeneratedSnippetsDir, relativePath);
    const renderedSnippet = renderSnippetTemplate(
        snippetReplacements,
        await readFile(sourcePath, "utf8")
    );

    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, renderedSnippet);
}

console.log("Prepared docs assets in docs/.");
