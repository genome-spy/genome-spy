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
    const references = new Set();
    const declarations = new Set(Object.keys(files));

    collectNamedData(spec, references, declarations);

    return new Set(
        Array.from(references).filter((name) => !declarations.has(name))
    );
}

/**
 * @param {unknown} value
 * @param {Set<string>} references
 * @param {Set<string>} declarations
 */
function collectNamedData(value, references, declarations) {
    if (Array.isArray(value)) {
        value.forEach((item) =>
            collectNamedData(item, references, declarations)
        );
    } else if (value && typeof value == "object") {
        const object = /** @type {Record<string, any>} */ (value);

        if (isObject(object.datasets)) {
            Object.keys(object.datasets).forEach((name) =>
                declarations.add(name)
            );
        }

        if (isNamedData(object.data)) {
            references.add(object.data.name);
        }

        if (object.type == "lookup" && isNamedData(object.from)) {
            references.add(object.from.name);
        }

        Object.entries(object).forEach(([key, child]) => {
            // Dataset contents and inline values may contain arbitrary objects
            // that happen to resemble visualization specifications.
            if (key != "datasets" && key != "values") {
                collectNamedData(child, references, declarations);
            }
        });
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
