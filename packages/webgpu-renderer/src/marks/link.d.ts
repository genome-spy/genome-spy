import type {
    LinkMarkProperties,
    MarkConfig,
    MarkDefinition,
    TypedArray,
} from "../index.js";

export const linkMark: MarkDefinition<
    MarkConfig<"link">,
    Record<string, TypedArray>,
    LinkMarkProperties
>;
