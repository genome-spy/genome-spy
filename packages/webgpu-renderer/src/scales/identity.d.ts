import type { ConfiguredScale, ScaleDef, ScaleOptions } from "../index.js";

export const identityScaleDefinition: ScaleDef;
export function identityScale(
    options?: ScaleOptions
): ConfiguredScale<"identity">;
