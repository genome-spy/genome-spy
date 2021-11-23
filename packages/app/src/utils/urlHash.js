import {
    compressToEncodedURIComponent,
    decompressFromEncodedURIComponent,
} from "lz-string";
import { crc32hex } from "./crc32";

/**
 * @param {any} value
 */
export function compressToUrlHash(value) {
    const compressed = compressToEncodedURIComponent(JSON.stringify(value));
    return "#" + compressed + crc32hex(compressed);
}

/**
 * @param {string} hash
 */
export function decompressFromUrlHash(hash) {
    if (!hash || hash.length < 10) {
        throw new Error("The state string in the URL is too short.");
    }

    const compressed = hash.slice(1, -8);
    const checksum = hash.slice(-8);

    if (crc32hex(compressed) !== checksum) {
        throw new Error("The state string in the URL is corrupted.");
    }

    return JSON.parse(decompressFromEncodedURIComponent(compressed));
}
