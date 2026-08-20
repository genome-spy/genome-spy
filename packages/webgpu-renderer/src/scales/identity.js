import { identityScaleDef } from "../marks/scales/defs/identity.js";
import { createScale } from "./createScale.js";

export const identityScaleDefinition = identityScaleDef;

/**
 * @param {import("../index.d.ts").ScaleOptions} [options]
 * @returns {import("../index.d.ts").ConfiguredScale<"identity">}
 */
export function identityScale(options = {}) {
    return /** @type {import("../index.d.ts").ConfiguredScale<"identity">} */ (
        createScale(identityScaleDefinition, options)
    );
}
