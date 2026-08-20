import { linearScaleDef } from "../marks/scales/defs/linear.js";

/** Immutable linear-scale behavior shared by configured scale values. */
export const linearScaleDefinition = linearScaleDef;

/**
 * Create a linear scale config that carries its implementation definition.
 * Domain and range values remain mutable through renderer-owned scale slots;
 * the definition itself contains no GPU state.
 *
 * @param {import("../index.d.ts").LinearScaleOptions} [options]
 * @returns {import("../index.d.ts").DefinedChannelScale}
 */
export function linearScale(options = {}) {
    return {
        ...options,
        type: "linear",
        definition: linearScaleDefinition,
    };
}
