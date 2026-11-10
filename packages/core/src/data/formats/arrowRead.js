import { tableFromIPC } from "@uwdata/flechette";

/**
 * @param {ArrayBuffer | Uint8Array | Uint8Array[]} data
 */
export function readArrow(data) {
    // Flechette creates typed-array views over the input. Copy misaligned views
    // so Arrow's 8-byte alignment does not depend on the caller's byte offset.
    if (data instanceof Uint8Array && data.byteOffset % 8 !== 0) {
        data = new Uint8Array(data);
    }

    return tableFromIPC(data).toArray();
}
