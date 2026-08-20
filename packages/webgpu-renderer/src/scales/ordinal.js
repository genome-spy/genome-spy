import { ordinalScaleDef } from "../marks/scales/defs/ordinal.js";
import { createScale } from "./createScale.js";

export const ordinalScaleDefinition = ordinalScaleDef;

/**
 * @param {import("../index.d.ts").ScaleOptions} [options]
 * @returns {import("../index.d.ts").ConfiguredScale<"ordinal">}
 */
export function ordinalScale(options = {}) {
    return /** @type {import("../index.d.ts").ConfiguredScale<"ordinal">} */ (
        createScale(ordinalScaleDefinition, options)
    );
}
