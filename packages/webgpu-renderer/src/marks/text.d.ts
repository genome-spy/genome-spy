import type {
    MarkConfig,
    MarkDefinition,
    TextMarkProperties,
    TextSeries,
} from "../index.js";

export const textMark: MarkDefinition<
    MarkConfig<"text">,
    TextSeries,
    TextMarkProperties
>;
