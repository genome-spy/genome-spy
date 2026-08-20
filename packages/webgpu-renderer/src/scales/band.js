import { bandScaleDef } from "../marks/scales/defs/band.js";
import { createScale } from "./createScale.js";

export const bandScaleDefinition = bandScaleDef;

/**
 * @param {import("../index.d.ts").ScaleOptions} [options]
 * @returns {import("../index.d.ts").ConfiguredScale<"band">}
 */
export function bandScale(options = {}) {
    return /** @type {import("../index.d.ts").ConfiguredScale<"band">} */ (
        createScale(bandScaleDefinition, options)
    );
}
