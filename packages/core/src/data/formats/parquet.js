import { formats as vegaFormats } from "vega-loader";

/*
 * Adapted from: https://github.com/vega/vega-loader-parquet/blob/main/src/index.js
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
    const buffer = data instanceof Uint8Array ? getExactBuffer(data) : data;

    return await parquetReadObjects({ file: buffer });
}

/**
 * Returns an ArrayBuffer containing exactly the bytes addressed by the view.
 *
 * @param {Uint8Array} data
 * @returns {ArrayBuffer}
 */
function getExactBuffer(data) {
    if (
        data.buffer instanceof ArrayBuffer &&
        data.byteOffset === 0 &&
        data.byteLength === data.buffer.byteLength
    ) {
        return data.buffer;
    } else {
        const copy = new Uint8Array(data.byteLength);
        copy.set(data);
        return copy.buffer;
    }
}

parquet.responseType = "arrayBuffer";

vegaFormats("parquet", parquet);
