import { isDiscrete } from "vega-scale";

/** @param {unknown} value @returns {value is import("../spec/channel.js").Scalar} */
export function isCategoryValue(value) {
    return (
        typeof value === "string" ||
        typeof value === "boolean" ||
        (typeof value === "number" && Number.isFinite(value))
    );
}

/**
 * Validates and detaches complete membership before it can be published.
 *
 * @param {import("../spec/parameter.js").CategorySelectionChannel} component
 * @param {Iterable<import("../spec/channel.js").Scalar>} [values]
 * @param {boolean} [multiple]
 * @returns {import("../types/selectionTypes.js").CategoryPointSelection}
 */
export function createCategorySelection(
    component,
    values = [],
    multiple = true
) {
    const membership = new Set(values);
    if (!Array.from(membership).every(isCategoryValue)) {
        throw new Error("Category selections require finite scalar values.");
    }
    if (!multiple && membership.size > 1) {
        throw new Error(
            "Single category selections accept at most one distinct value."
        );
    }
    return { type: "categories", component, values: membership };
}

/**
 * @param {import("../spec/parameter.js").PointSelectionConfig} select
 * @param {readonly (readonly import("../spec/channel.js").Scalar[])[]} tuples
 */
export function categorySelectionFromTuples(select, tuples) {
    if (
        !Array.isArray(tuples) ||
        tuples.some((tuple) => !Array.isArray(tuple) || tuple.length !== 1)
    ) {
        throw new Error(
            "Category tuples must contain exactly one finite scalar value."
        );
    }
    return createCategorySelection(
        select.encodings[0],
        tuples.map((tuple) => tuple[0]),
        !!select.toggle
    );
}

/**
 * @param {import("../types/selectionTypes.js").CategoryPointSelection} selection
 * @param {unknown} value
 * @param {boolean} toggle
 * @returns {import("../types/selectionTypes.js").CategoryPointSelection | undefined}
 */
export function updateCategorySelection(selection, value, toggle) {
    if (!isCategoryValue(value)) {
        return toggle
            ? undefined
            : createCategorySelection(selection.component);
    }
    const values = toggle ? new Set(selection.values) : new Set();
    if (toggle && values.has(value)) {
        values.delete(value);
    } else {
        values.add(value);
    }
    return createCategorySelection(selection.component, values);
}

/**
 * Resolve logical channels through the mark's existing normalization metadata.
 * No rendered color, shape code, or domain position participates in membership.
 *
 * @param {import("../spec/channel.js").Encoding} encoding
 * @param {import("../spec/parameter.js").CategorySelectionChannel} component
 * @param {(channel: import("../spec/channel.js").ChannelWithScale) => import("../types/encoder.js").VegaScale} getScale
 */
export function resolveCategoryInput(encoding, component, getScale) {
    const entries = Object.entries(
        /** @type {Record<string, import("../spec/channel.js").MarkPropFieldDef>} */ (
            encoding
        )
    );
    const [input, definition] =
        entries.find(([channel]) => channel === component) ??
        entries.find(
            ([, definition]) => definition?.resolutionChannel === component
        ) ??
        [];
    if (!definition || !("field" in definition) || "condition" in definition) {
        throw new Error(
            `Category selection input "${component}" must be an unconditional field encoding.`
        );
    }
    const channelDef =
        /** @type {import("../spec/channel.js").MarkPropFieldDef} */ (
            definition
        );
    const scaleChannel = channelDef.resolutionChannel ?? component;
    const scale = getScale(scaleChannel);
    if (
        !["nominal", "ordinal"].includes(channelDef.type) ||
        !scale ||
        !isDiscrete(scale.type)
    ) {
        throw new Error(
            `Category selection input "${component}" requires a nominal or ordinal field with a discrete scale.`
        );
    }
    return { input, field: channelDef.field, scale, type: channelDef.type };
}
