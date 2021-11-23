/**
 * Validates data source params, infers format if not specified explicitly,
 * returns a complete DataSource params object.
 *
 * @param {import("../../spec/data").DataSource} params
 *      DataSource parameters
 */
export function getFormat(params) {
    const format = { ...params.format };

    format.type = format.type || extractTypeFromUrl(params.url);
    format.parse = format.parse || "auto";

    if (!format.type) {
        throw new Error(
            "Format for the data source was not defined and it could not be inferred: " +
                JSON.stringify(params)
        );
    }

    return format;
}

/**
 * @param {string} url
 */
export function extractTypeFromUrl(url) {
    if (url) {
        return url.match(/\.(csv|tsv|json)/)?.[1];
    }
}
