import type {
    DefinedChannelScale,
    LinearScaleOptions,
    ScaleDef,
} from "../index.js";

export const linearScaleDefinition: ScaleDef;

export function linearScale(
    options?: LinearScaleOptions
): DefinedChannelScale & { type: "linear" };
