import { isNumericArray } from "../types.js";

/**
 * @param {import("../types.js").ScalarType} type
 * @param {1|2|4} components
 * @param {import("../index.d.ts").NumericValue} value
 * @returns {string}
 */
export function formatLiteral(type, components, value) {
    if (typeof value !== "number" && !isNumericArray(value)) {
        throw new Error("WGSL literals require a numeric scalar or vector.");
    }
    const scalarType = type === "u32" ? "u32" : type === "i32" ? "i32" : "f32";

    /**
     * @param {number} v
     * @returns {string}
     */
    const formatScalar = (v) => {
        const num = Number(v ?? 0);
        if (type === "u32") {
            return `u32(${Math.trunc(num)})`;
        }
        if (type === "i32") {
            return `i32(${Math.trunc(num)})`;
        }
        if (Number.isInteger(num)) {
            return `${num}.0`;
        }
        return `${num}`;
    };

    if (components === 1) {
        return formatScalar(typeof value === "number" ? value : value[0]);
    }
    const values = typeof value === "number" ? [value] : value;
    const formatted = Array.from({ length: components }, (_, i) =>
        formatScalar(values[i])
    );
    return `vec${components}<${scalarType}>(${formatted.join(", ")})`;
}
