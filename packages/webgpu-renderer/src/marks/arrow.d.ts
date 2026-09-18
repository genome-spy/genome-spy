import type {
    ArrowMarkProperties,
    MarkConfig,
    MarkDefinition,
    TypedArray,
} from "../index.js";

export const ARROW_DIRECTIONS: Readonly<{
    forward: 0;
    reverse: 1;
    both: 2;
}>;

export const arrowMark: MarkDefinition<
    MarkConfig<"arrow">,
    Record<string, TypedArray>,
    ArrowMarkProperties
>;
