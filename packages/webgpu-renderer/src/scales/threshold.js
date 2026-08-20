import { thresholdScaleDef } from "../marks/scales/defs/threshold.js";
import { createScale } from "./createScale.js";

export const thresholdScaleDefinition = thresholdScaleDef;

/**
 * @param {import("../index.d.ts").ScaleOptions} [options]
 * @returns {import("../index.d.ts").ConfiguredScale<"threshold">}
 */
export function thresholdScale(options = {}) {
    return /** @type {import("../index.d.ts").ConfiguredScale<"threshold">} */ (
        createScale(thresholdScaleDefinition, options)
    );
}
