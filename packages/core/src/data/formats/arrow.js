import { formats as vegaFormats } from "vega-loader";

/**
 * @returns {Promise<typeof import("@uwdata/flechette").tableFromIPC>}
 */
async function loadTableFromIPC() {
    const { tableFromIPC } = await import("@uwdata/flechette");
    return tableFromIPC;
}

/**
 * Load an Apache Arrow IPC file or stream as plain row objects.
 *
 * @param {ArrayBuffer | Uint8Array | Uint8Array[]} data Arrow IPC binary data.
 * @returns {Promise<Record<string, any>[]>}
 */
export default async function arrow(data) {
    const tableFromIPC = await loadTableFromIPC();
    return tableFromIPC(alignData(data)).toArray();
}

/**
 * Flechette creates typed-array views directly over the input buffer. Arrow
 * buffers use 8-byte alignment, so an arbitrarily offset Uint8Array must be
 * copied to an aligned buffer before decoding.
 *
 * @param {ArrayBuffer | Uint8Array | Uint8Array[]} data
 */
function alignData(data) {
    if (data instanceof Uint8Array && data.byteOffset % 8 !== 0) {
        const copy = new Uint8Array(data.byteLength);
        copy.set(data);
        return copy;
    } else {
        return data;
    }
}

arrow.responseType = "arrayBuffer";

vegaFormats("arrow", arrow);
