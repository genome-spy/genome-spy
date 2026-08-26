import type { ConfiguredScale, ScaleDef, ScaleOptions } from "../index.js";

export const quantizeScaleDefinition: ScaleDef;
export function quantizeScale(
    options?: ScaleOptions
): ConfiguredScale<"quantize">;
