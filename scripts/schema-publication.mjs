import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import Ajv from "ajv";
import { getSchemaUrls, parseStableVersion } from "./schema-workflow.mjs";

/**
 * Publish one package schema without removing any earlier release artifacts.
 *
 * @param {{
 *   siteDir: string,
 *   library: "core" | "app",
 *   version: string,
 *   schemaPath: string,
 * }} options
 */
export async function publishSchema(options) {
    const { siteDir, library, version, schemaPath } = options;
    const versionParts = parseStableVersion(version);
    const schemaContent = await readFile(schemaPath);
    const schemaDir = path.join(siteDir, "schema", library);
    const manifestPath = path.join(schemaDir, "manifest.json");
    const filenames = getSchemaFilenames(library, version);

    await mkdir(schemaDir, { recursive: true });
    const manifest = await readManifest(manifestPath, schemaDir);

    await writeImmutableExact(
        path.join(schemaDir, filenames.exact),
        schemaContent
    );

    const aliases = [
        [filenames.minor, `v${versionParts.major}.${versionParts.minor}`],
        [filenames.major, `v${versionParts.major}`],
    ];
    for (const [filename, alias] of aliases) {
        await updateAlias({
            schemaDir,
            filename,
            alias,
            version,
            schemaContent,
            manifest,
        });
    }

    if (!manifest.versions.includes(version)) {
        manifest.versions.push(version);
        manifest.versions.sort(compareStableVersions);
    }
    manifest.aliases = Object.fromEntries(
        Object.entries(manifest.aliases).sort(([a], [b]) =>
            compareAliases(a, b)
        )
    );

    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}

/**
 * Whether publishing the release would move its public major alias forward.
 * Older release reruns do not need to validate a newer documentation corpus
 * against an older schema.
 *
 * @param {{
 *   siteDir: string,
 *   library: "core" | "app",
 *   version: string,
 * }} options
 */
export async function advancesMajorAlias(options) {
    const { siteDir, library, version } = options;
    const { major } = parseStableVersion(version);
    const manifestPath = path.join(siteDir, "schema", library, "manifest.json");
    if (!(await exists(manifestPath))) {
        return true;
    }

    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const currentVersion = manifest.aliases[`v${major}`];

    return (
        !currentVersion || compareStableVersions(currentVersion, version) < 0
    );
}

/**
 * Verify that a manual documentation deployment can refer to an already
 * published major alias without changing the public schema tree.
 *
 * @param {{
 *   siteDir: string,
 *   library: "core" | "app",
 *   version: string,
 * }} options
 */
export async function verifyPublishedMajorAlias(options) {
    const { siteDir, library, version } = options;
    const major = parseVersionMajor(version);
    const schemaDir = path.join(siteDir, "schema", library);
    const alias = `v${major}`;
    const aliasPath = path.join(schemaDir, alias + ".json");
    const manifestPath = path.join(schemaDir, "manifest.json");

    if (!(await exists(aliasPath)) || !(await exists(manifestPath))) {
        throw new Error(
            `Cannot deploy ${library} v${major} documentation before its stable schema alias is published`
        );
    }

    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const targetVersion = manifest.aliases[alias];
    if (!targetVersion || parseStableVersion(targetVersion).major !== major) {
        throw new Error(
            `Published ${library} ${alias} schema alias is missing from its manifest`
        );
    }

    const aliasContent = await readFile(aliasPath);
    const exactContent = await readFile(
        path.join(schemaDir, `v${targetVersion}.json`)
    );
    if (!aliasContent.equals(exactContent)) {
        throw new Error(
            `Published ${library} ${alias} schema alias does not match its manifest`
        );
    }
}

/**
 * Validate compatible examples from the currently deployed documentation
 * before an alias advances. A v0 corpus is also checked for the first v1
 * release because GenomeSpy explicitly promises that transition is compatible.
 *
 * @param {{
 *   examplesDir: string,
 *   library: "core" | "app",
 *   version: string,
 *   schemaPath: string,
 * }} options
 */
export async function validatePreviousExamples(options) {
    const { examplesDir, library, version, schemaPath } = options;
    if (!(await exists(examplesDir))) {
        return { checked: 0, skipped: 0 };
    }

    const incomingMajor = parseStableVersion(version).major;
    const schema = JSON.parse(await readFile(schemaPath, "utf8"));
    const validate = new Ajv.default({
        allErrors: true,
        strict: false,
        allowUnionTypes: true,
    }).compile(schema);
    const roots = library === "core" ? ["core", "docs"] : ["app"];
    let checked = 0;
    let skipped = 0;

    for (const root of roots) {
        const rootDir = path.join(examplesDir, root);
        if (!(await exists(rootDir))) {
            continue;
        }

        for (const examplePath of await collectJsonFiles(rootDir)) {
            const spec = JSON.parse(await readFile(examplePath, "utf8"));
            const declaredSchema = spec.$schema;

            if (isThirdPartySchema(declaredSchema)) {
                skipped++;
                continue;
            }

            const declared = parseCanonicalSchema(declaredSchema);
            if (declared && declared.library !== library) {
                throw new Error(
                    `Previous ${library} example declares the ${declared.library} schema: ${examplePath}`
                );
            }
            if (
                declared &&
                declared.major !== incomingMajor &&
                !(declared.major === 0 && incomingMajor === 1)
            ) {
                skipped++;
                continue;
            }

            checked++;
            if (!validate(spec)) {
                throw new Error(
                    `Schema ${library} v${version} is incompatible with ${examplePath}:\n` +
                        JSON.stringify(validate.errors, null, 2)
                );
            }
        }
    }

    return { checked, skipped };
}

/**
 * @param {"core" | "app"} library
 * @param {string} version
 */
function getSchemaFilenames(library, version) {
    const urls = getSchemaUrls(library, version);

    return Object.fromEntries(
        Object.entries(urls).map(([kind, url]) => [kind, path.basename(url)])
    );
}

/**
 * @param {string} manifestPath
 * @param {string} schemaDir
 */
async function readManifest(manifestPath, schemaDir) {
    if (await exists(manifestPath)) {
        return JSON.parse(await readFile(manifestPath, "utf8"));
    }

    const existingSchemaFiles = (await readdir(schemaDir)).filter((filename) =>
        /^v\d+(?:\.\d+){0,2}\.json$/.test(filename)
    );
    if (existingSchemaFiles.length) {
        throw new Error(
            `Cannot manage existing schema files without a manifest: ${schemaDir}`
        );
    }

    return { aliases: {}, versions: [] };
}

/**
 * @param {string} exactPath
 * @param {Buffer} schemaContent
 */
async function writeImmutableExact(exactPath, schemaContent) {
    if (await exists(exactPath)) {
        const existingContent = await readFile(exactPath);
        if (!existingContent.equals(schemaContent)) {
            throw new Error(
                "Refusing to overwrite immutable schema: " + exactPath
            );
        }
    } else {
        await writeFile(exactPath, schemaContent);
    }
}

/**
 * @param {{
 *   schemaDir: string,
 *   filename: string,
 *   alias: string,
 *   version: string,
 *   schemaContent: Buffer,
 *   manifest: { aliases: Record<string, string>, versions: string[] },
 * }} options
 */
async function updateAlias(options) {
    const { schemaDir, filename, alias, version, schemaContent, manifest } =
        options;
    const aliasPath = path.join(schemaDir, filename);
    const currentVersion = manifest.aliases[alias];

    if (!currentVersion || compareStableVersions(currentVersion, version) < 0) {
        if (!currentVersion && (await exists(aliasPath))) {
            throw new Error(
                `Cannot update unmanaged schema alias without a manifest entry: ${aliasPath}`
            );
        }

        await writeFile(aliasPath, schemaContent);
        manifest.aliases[alias] = version;
        return;
    }

    const expectedPath = path.join(schemaDir, `v${currentVersion}.json`);
    const expectedContent = await readFile(expectedPath);
    const aliasContent = await readFile(aliasPath);
    if (!aliasContent.equals(expectedContent)) {
        throw new Error(
            "Schema alias does not match its manifest: " + aliasPath
        );
    }
}

/**
 * @param {string} a
 * @param {string} b
 */
export function compareStableVersions(a, b) {
    const left = parseStableVersion(a);
    const right = parseStableVersion(b);

    return (
        left.major - right.major ||
        left.minor - right.minor ||
        left.patch - right.patch
    );
}

/**
 * @param {string} a
 * @param {string} b
 */
function compareAliases(a, b) {
    const left = a.slice(1).split(".").map(Number);
    const right = b.slice(1).split(".").map(Number);

    return (
        left[0] - right[0] || left.length - right.length || left[1] - right[1]
    );
}

/**
 * Accept prerelease package versions here because the check only selects an
 * already published major; it does not publish the prerelease schema.
 *
 * @param {string} version
 */
function parseVersionMajor(version) {
    const match = /^(0|[1-9]\d*)\./.exec(version);
    if (!match) {
        throw new Error("Invalid package version: " + version);
    }

    return Number(match[1]);
}

/**
 * @param {string | undefined} uri
 */
function isThirdPartySchema(uri) {
    return Boolean(uri?.startsWith("https://vega.github.io/schema/vega-lite/"));
}

/**
 * @param {string | undefined} uri
 */
function parseCanonicalSchema(uri) {
    const match =
        /^https:\/\/genomespy\.app\/schema\/(core|app)\/v(\d+)(?:\.\d+){0,2}\.json$/.exec(
            uri ?? ""
        );

    return match
        ? {
              library: /** @type {"core" | "app"} */ (match[1]),
              major: Number(match[2]),
          }
        : undefined;
}

/**
 * @param {string} root
 */
async function collectJsonFiles(root) {
    /** @type {string[]} */
    const files = [];

    for (const entry of await readdir(root, { withFileTypes: true })) {
        const entryPath = path.join(root, entry.name);
        if (entry.isDirectory()) {
            files.push(...(await collectJsonFiles(entryPath)));
        } else if (entry.isFile() && entry.name.endsWith(".json")) {
            files.push(entryPath);
        }
    }

    return files;
}

/**
 * @param {string} filePath
 */
async function exists(filePath) {
    try {
        await access(filePath);
        return true;
    } catch {
        return false;
    }
}
