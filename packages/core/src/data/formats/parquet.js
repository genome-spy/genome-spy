/*
 * Adapted from: https://github.com/vega/vega-loader-parquet/blob/main/src/index.js
 */

/**
 * Load a data set in Apache Parquet format for use in Vega.
 * @param {ArrayBuffer|Uint8Array} data Parquet binary data.
 * @returns {Promise<Record<string,any>[]>} A promise that resolves to an array of data objects representing
 *  rows of a data table.
 */
export default async function parquet(data) {
    const hyparquet = await import("hyparquet");
    const buffer =
        data instanceof Uint8Array
            ? /** @type {ArrayBuffer} */ (data.buffer)
            : data;
    return await hyparquet.parquetReadObjects({ file: buffer });
}

parquet.responseType = "arrayBuffer";
