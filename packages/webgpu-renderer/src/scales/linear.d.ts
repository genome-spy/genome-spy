import type {
    ConfiguredScale,
    LinearScaleOptions,
    ScaleDef,
} from "../index.js";

export const linearScaleDefinition: ScaleDef;

export function linearScale(
    options?: LinearScaleOptions
): ConfiguredScale<"linear">;
