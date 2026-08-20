import { indexScaleDef } from "../marks/scales/defs/index.js";
import { createScale } from "./createScale.js";

export const indexScaleDefinition = indexScaleDef;

/**
 * @param {import("../index.d.ts").ScaleOptions} [options]
 * @returns {import("../index.d.ts").ConfiguredScale<"index">}
 */
export function indexScale(options = {}) {
    return /** @type {import("../index.d.ts").ConfiguredScale<"index">} */ (
        createScale(indexScaleDefinition, options)
    );
}
