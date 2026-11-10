import { formats as vegaFormats } from "vega-loader";

/**
 * Load an Apache Arrow IPC file or stream as plain row objects.
 *
 * @param {ArrayBuffer | Uint8Array | Uint8Array[]} data Arrow IPC binary data.
 * @returns {Promise<Record<string, any>[]>}
 */
export default async function arrow(data) {
    const { readArrow } = await import("./arrowRead.js");
    return readArrow(data);
}

arrow.responseType = "arrayBuffer";

vegaFormats("arrow", arrow);
