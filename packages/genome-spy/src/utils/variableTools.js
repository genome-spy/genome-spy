import { isBoolean, isNumber, isString } from "vega-util";

/** A set of typical NA values */
export const NAs = new Set(["", "NA", ".", "-"]);

/**
 * Tests whether the given array of strings can be interpreted as a numeric vector
 *
 * @param {string[]} values
 */
export function inferNumeric(values) {
    return values
        .filter((value) => typeof value == "string")
        .filter((value) => !NAs.has(value))
        .every((value) => /^[+-]?\d+(\.\d*)?$/.test(value));
}

/**
 * @param {any} value
 * @returns {value is string | number | boolean}
 */
export function isScalar(value) {
    return isString(value) || isNumber(value) || isBoolean(value);
}
