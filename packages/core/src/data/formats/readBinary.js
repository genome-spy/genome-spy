import { formats } from "vega-loader";

const supportedFormats = new Set(["arrow", "parquet"]);

/**
 * Reads an in-memory binary dataset through a registered format reader.
 *
 * @param {ArrayBuffer | ArrayBufferView} data
 * @param {{ type: "arrow" | "parquet" }} format
 * @returns {Promise<Record<string, any>[]>}
 */
export async function readBinaryData(data, format) {
    if (!supportedFormats.has(format.type)) {
        throw new Error("Unsupported binary data format: " + format.type);
    }

    const reader = formats(format.type);
    if (!reader) {
        throw new Error("Data format is not registered: " + format.type);
    }

    const bytes = toUint8Array(data);
    const rows = await reader(bytes, format);

    if (!Array.isArray(rows)) {
        throw new Error(
            `The ${format.type} data reader did not return an array.`
        );
    }

    return rows;
}

/**
 * @param {ArrayBuffer | ArrayBufferView} data
 */
function toUint8Array(data) {
    if (ArrayBuffer.isView(data)) {
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    } else if (data instanceof ArrayBuffer) {
        return new Uint8Array(data);
    } else {
        throw new TypeError(
            "Binary data must be an ArrayBuffer or ArrayBufferView."
        );
    }
}
