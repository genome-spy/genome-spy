/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable global-require */
/*
 * Adapted from: https://stackoverflow.com/a/18639999/1547896
 */

/**
 * A hack for nodejs (and jest)
 */
function getEncoder() {
    const Constr =
        typeof process !== "undefined"
            ? // eslint-disable-next-line no-undef
              require("util").TextEncoder
            : TextEncoder;
    return new Constr();
}

/** @type {number[]} */
let table;

function makeCRCTable() {
    /** @type {number} */
    let c;

    /** @type {number[]} */
    let crcTable = [];

    for (let i = 0; i < 256; i++) {
        c = i;
        for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        crcTable[i] = c;
    }
    return crcTable;
}

/**
 *
 * @param {string} str
 * @returns {number}
 */
export function crc32(str) {
    table ??= makeCRCTable();
    let crc = 0 ^ -1;

    const utf8 = getEncoder().encode(str);

    for (let i = 0; i < utf8.length; i++) {
        crc = (crc >>> 8) ^ table[(crc ^ utf8[i]) & 0xff];
    }

    return (crc ^ -1) >>> 0;
}

/**
 *
 * @param {string} str
 */
export function crc32hex(str) {
    return ("00000000" + crc32(str).toString(16)).slice(-8);
}
