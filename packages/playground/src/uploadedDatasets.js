/**
 * @typedef {Record<string, { data: any[] }>} UploadedFiles
 */

/**
 * Makes uploaded files available as root-scoped named datasets.
 *
 * Authored datasets take precedence, matching the old provider behavior: the
 * provider was only consulted when no dataset declaration resolved the name.
 *
 * @param {import("@genome-spy/core/spec/root.js").RootSpec} spec
 * @param {UploadedFiles} files
 */
export function addUploadedDatasets(spec, files) {
    const uploadedDatasets = Object.fromEntries(
        Object.entries(files).map(([name, file]) => [name, file.data])
    );

    if (Object.keys(uploadedDatasets).length > 0) {
        spec.datasets = {
            ...uploadedDatasets,
            ...spec.datasets,
        };
    }
}

/**
 * Finds named data references that cannot be satisfied by the edited
 * specification or uploaded files.
 *
 * This is only used for the Playground's upload hint. Dataset resolution
 * itself remains GenomeSpy's responsibility.
 *
 * @param {unknown} spec
 * @param {UploadedFiles} files
 * @returns {Set<string>}
 */
export function findMissingNamedData(spec, files) {
    const missing = new Set();

    collectMissingNamedData(spec, new Set(Object.keys(files)), missing);

    return missing;
}

/**
 * @param {unknown} value
 * @param {Set<string>} inheritedDeclarations
 * @param {Set<string>} missing
 */
function collectMissingNamedData(value, inheritedDeclarations, missing) {
    if (Array.isArray(value)) {
        value.forEach((item) =>
            collectMissingNamedData(item, inheritedDeclarations, missing)
        );
    } else if (value && typeof value == "object") {
        const object = /** @type {Record<string, any>} */ (value);
        const declarations = isObject(object.datasets)
            ? new Set([
                  ...inheritedDeclarations,
                  ...Object.keys(object.datasets),
              ])
            : inheritedDeclarations;

        if (isNamedData(object.data)) {
            addMissingName(object.data.name, declarations, missing);
        }

        if (object.type == "lookup" && isNamedData(object.from)) {
            addMissingName(object.from.name, declarations, missing);
        }

        Object.entries(object).forEach(([key, child]) => {
            // Dataset contents and inline values may contain arbitrary objects
            // that happen to resemble visualization specifications.
            if (key != "datasets" && key != "values") {
                collectMissingNamedData(child, declarations, missing);
            }
        });
    }
}

/**
 * @param {string} name
 * @param {Set<string>} declarations
 * @param {Set<string>} missing
 */
function addMissingName(name, declarations, missing) {
    if (!declarations.has(name)) {
        missing.add(name);
    }
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isObject(value) {
    return !!value && typeof value == "object" && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {value is { name: string }}
 */
function isNamedData(value) {
    return isObject(value) && typeof value.name == "string";
}
