
/** A set of typical NA values */
export const NAs = new Set(["", "NA", ".", "-"]);

/**
 * Tests whether the given array of strings can be interpreted as a numeric vector
 * 
 * @param {string[]} values 
 */
export function inferNumeric(values) {
    return values
        .filter(value => typeof value == "string")
        .filter(value => !NAs.has(value))
        .every(value => /^[+-]?\d+(\.\d*)?$/.test(value));
}