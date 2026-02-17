/**
 * Reads a browser File as UTF-8 text.
 *
 * @param {File} file
 * @returns {Promise<string>}
 */
export function readTextFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(/** @type {string} */ (reader.result));
        reader.onerror = () =>
            reject(reader.error ?? new Error("Could not read file."));
        reader.readAsText(file);
    });
}

/**
 * Infers a vega-loader tabular/json type from file name and content.
 *
 * @param {string} contents
 * @param {string} name
 * @returns {"json" | "csv" | "tsv"}
 */
export function inferMetadataFileType(contents, name) {
    if (/\.json$/i.test(name)) {
        return "json";
    } else {
        // In bioinformatics, many ".csv" files are actually tab-delimited.
        return contents.indexOf("\t") >= 0 ? "tsv" : "csv";
    }
}
