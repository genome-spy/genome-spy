/*
 * Adapted from: https://github.com/vega/vega-loader-parquet/blob/main/src/index.js
 * Parquet parsing is lazy-loaded from ./parquetRead.js to avoid pulling
 * hyparquet internals into the initial bundle.
 */

/**
 * @returns {Promise<typeof import("./parquetRead.js").parquetReadObjects>}
 */
async function loadParquetReadObjects() {
    const { parquetReadObjects } = await import("./parquetRead.js");
    return parquetReadObjects;
}

/**
 * Load a data set in Apache Parquet format for use in Vega.
 * @param {ArrayBuffer|Uint8Array} data Parquet binary data.
 * @returns {Promise<Record<string,any>[]>} A promise that resolves to an array of data objects representing
 *  rows of a data table.
 */
export default async function parquet(data) {
    const parquetReadObjects = await loadParquetReadObjects();
    const buffer =
        data instanceof Uint8Array
            ? /** @type {ArrayBuffer} */ (data.buffer)
            : data;

    return await parquetReadObjects({ file: buffer });
}

parquet.responseType = "arrayBuffer";
