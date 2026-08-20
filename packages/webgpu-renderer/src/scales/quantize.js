import { quantizeScaleDef } from "../marks/scales/defs/quantize.js";
import { createScale } from "./createScale.js";

export const quantizeScaleDefinition = quantizeScaleDef;

/**
 * @param {import("../index.d.ts").ScaleOptions} [options]
 * @returns {import("../index.d.ts").ConfiguredScale<"quantize">}
 */
export function quantizeScale(options = {}) {
    return /** @type {import("../index.d.ts").ConfiguredScale<"quantize">} */ (
        createScale(quantizeScaleDefinition, options)
    );
}
