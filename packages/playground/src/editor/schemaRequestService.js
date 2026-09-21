const LEGACY_CORE_SCHEMA_URLS = new Set([
    "https://unpkg.com/@genome-spy/core/dist/schema.json",
    "https://cdn.jsdelivr.net/npm/@genome-spy/core/dist/schema.json",
]);

/**
 * @param {string} uri
 * @param {string} coreVersion
 */
export function usesBundledCoreSchema(uri, coreVersion) {
    if (LEGACY_CORE_SCHEMA_URLS.has(uri)) {
        return true;
    }

    const currentMajor = getMajor(coreVersion);
    const match =
        /^https:\/\/genomespy\.app\/schema\/core\/v(\d+)(?:\.\d+){0,2}\.json$/.exec(
            uri
        );

    return match ? Number(match[1]) === currentMajor : false;
}

/**
 * @param {object} schema
 * @param {string} coreVersion
 * @param {typeof fetch} [fetchSchema]
 */
export function createSchemaRequestService(
    schema,
    coreVersion,
    fetchSchema = globalThis.fetch
) {
    const bundledSchema = JSON.stringify(schema);

    /** @param {string} uri */
    return async (uri) => {
        if (usesBundledCoreSchema(uri, coreVersion)) {
            return bundledSchema;
        }

        const response = await fetchSchema(uri);
        if (!response.ok) {
            throw new Error(
                `Unable to load JSON Schema ${uri}: ${response.status} ${response.statusText}`
            );
        }

        return response.text();
    };
}

/**
 * @param {string} version
 */
function getMajor(version) {
    const match = /^(0|[1-9]\d*)\./.exec(version);
    if (!match) {
        throw new Error("Invalid GenomeSpy Core version: " + version);
    }

    return Number(match[1]);
}
