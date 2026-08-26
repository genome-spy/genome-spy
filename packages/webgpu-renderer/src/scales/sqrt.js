import { sqrtScaleDef } from "../marks/scales/defs/sqrt.js";
import { createScale } from "./createScale.js";

export const sqrtScaleDefinition = sqrtScaleDef;

/**
 * @param {import("../index.d.ts").ScaleOptions} [options]
 * @returns {import("../index.d.ts").ConfiguredScale<"sqrt">}
 */
export function sqrtScale(options = {}) {
    return /** @type {import("../index.d.ts").ConfiguredScale<"sqrt">} */ (
        createScale(sqrtScaleDefinition, options)
    );
}
