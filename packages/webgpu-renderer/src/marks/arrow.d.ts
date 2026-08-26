import type {
    ArrowMarkProperties,
    MarkConfig,
    MarkDefinition,
    TypedArray,
} from "../index.js";

export const arrowMark: MarkDefinition<
    MarkConfig<"arrow">,
    Record<string, TypedArray>,
    ArrowMarkProperties
>;
