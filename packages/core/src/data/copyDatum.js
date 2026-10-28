import { UNIQUE_ID_KEY } from "./transforms/identifier.js";

/** Detached public row using the same copy contract as view data readback. @param {Record<string, any>} datum */
export function copyDatum(datum) {
    const row = structuredClone(datum);
    delete row[UNIQUE_ID_KEY];
    return row;
}
