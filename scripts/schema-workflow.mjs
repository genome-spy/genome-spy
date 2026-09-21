const SCHEMA_ORIGIN = "https://genomespy.app/schema";

/**
 * @param {string} version
 */
export function parseStableVersion(version) {
    const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
    if (!match) {
        throw new Error("Expected a stable semantic version, got: " + version);
    }

    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
    };
}

/**
 * Return the public schema URLs for a stable package release.
 *
 * @param {"core" | "app"} library
 * @param {string} version
 */
export function getSchemaUrls(library, version) {
    const { major, minor } = parseStableVersion(version);
    const base = `${SCHEMA_ORIGIN}/${library}`;

    return {
        major: `${base}/v${major}.json`,
        minor: `${base}/v${major}.${minor}.json`,
        exact: `${base}/v${version}.json`,
    };
}

/**
 * Add the canonical major schema URL to a staged public example. Checked-in
 * sources intentionally stay version-neutral so that local tooling can select
 * the schema built by the current checkout.
 *
 * @param {string} relativePath POSIX path relative to examples/
 * @param {string} content
 * @param {{ core: string, app: string }} versions
 */
export function preparePublishedExample(relativePath, content, versions) {
    const library = getExampleLibrary(relativePath);
    if (!library) {
        return content;
    }

    const spec = JSON.parse(content);
    if (!spec || Array.isArray(spec) || typeof spec !== "object") {
        throw new Error(
            "Example specification must be an object: " + relativePath
        );
    }

    if ("$schema" in spec) {
        throw new Error(
            "Unexpected explicit $schema in maintained example: " + relativePath
        );
    }

    const newline = content.includes("\r\n") ? "\r\n" : "\n";
    const opening = new RegExp(`^(\\uFEFF?\\s*\\{)${newline}`).exec(content);
    if (!opening) {
        throw new Error(
            "Example specification must start with an object on its own line: " +
                relativePath
        );
    }

    const firstProperty = new RegExp(`${newline}([ \\t]+)\\S`).exec(content);
    const indentation = firstProperty?.[1] ?? "  ";
    const schemaUrl = getSchemaUrls(library, versions[library]).major;
    const schemaProperty = `${indentation}"$schema": "${schemaUrl}",`;

    return content.replace(
        opening[0],
        opening[1] + newline + schemaProperty + newline + newline
    );
}

/**
 * @param {string} relativePath
 * @returns {"core" | "app" | undefined}
 */
function getExampleLibrary(relativePath) {
    if (relativePath.startsWith("app/")) {
        return "app";
    }
    if (relativePath.startsWith("core/") || relativePath.startsWith("docs/")) {
        return "core";
    }
}
