import { format as d3format } from "d3-format";
import clamp from "./clamp.js";

/** @type {Map<string, (value: number) => string>} */
const formatters = new Map();
const trailingPrefix = /\d[a-zµ]$/i;

/**
 * Formats a value in an unprefixed unit with an appropriate SI prefix.
 *
 * @param {number} value
 * @param {string} unit
 * @param {number} [digits]
 */
export default function formatUnit(value, unit, digits = 6) {
    const basePairs = unit === "bp";
    const type = basePairs && Math.abs(value) < 1 ? "r" : "s";
    const specifier = `.${clamp(digits, 1, 21)}~${type}`;
    let formatter = formatters.get(specifier);
    if (!formatter) {
        formatter = d3format(specifier);
        formatters.set(specifier, formatter);
    }

    const label = formatter(value);
    if (trailingPrefix.test(label)) {
        const prefix = label.at(-1);
        return `${label.slice(0, -1)} ${prefix}${basePairs ? "b" : unit}`;
    }
    return label + " " + unit;
}
