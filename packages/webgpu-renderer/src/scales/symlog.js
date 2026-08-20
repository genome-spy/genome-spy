import { symlogScaleDef } from "../marks/scales/defs/symlog.js";
import { createScale } from "./createScale.js";

export const symlogScaleDefinition = symlogScaleDef;

/**
 * @param {import("../index.d.ts").ScaleOptions} [options]
 * @returns {import("../index.d.ts").ConfiguredScale<"symlog">}
 */
export function symlogScale(options = {}) {
    return /** @type {import("../index.d.ts").ConfiguredScale<"symlog">} */ (
        createScale(symlogScaleDefinition, options)
    );
}
