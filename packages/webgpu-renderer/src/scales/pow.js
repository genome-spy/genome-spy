import { powScaleDef } from "../marks/scales/defs/pow.js";
import { createScale } from "./createScale.js";

export const powScaleDefinition = powScaleDef;

/**
 * @param {import("../index.d.ts").ScaleOptions} [options]
 * @returns {import("../index.d.ts").ConfiguredScale<"pow">}
 */
export function powScale(options = {}) {
    return /** @type {import("../index.d.ts").ConfiguredScale<"pow">} */ (
        createScale(powScaleDefinition, options)
    );
}
