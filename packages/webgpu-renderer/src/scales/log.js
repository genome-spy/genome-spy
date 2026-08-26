import { logScaleDef } from "../marks/scales/defs/log.js";
import { createScale } from "./createScale.js";

export const logScaleDefinition = logScaleDef;

/**
 * @param {import("../index.d.ts").ScaleOptions} [options]
 * @returns {import("../index.d.ts").ConfiguredScale<"log">}
 */
export function logScale(options = {}) {
    return /** @type {import("../index.d.ts").ConfiguredScale<"log">} */ (
        createScale(logScaleDefinition, options)
    );
}
