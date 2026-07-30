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
    return tableFromIPC(data).toArray();
}

arrow.responseType = "arrayBuffer";

vegaFormats("arrow", arrow);
