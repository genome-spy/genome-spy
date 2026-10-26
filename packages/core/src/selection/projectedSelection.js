/**
 * Single-field value selection, following Vega-Lite's projected point selections.
 * https://github.com/vega/vega-lite/blob/main/src/compile/selection/legends.ts
 *
 * @param {string[]} fields
 * @param {readonly (readonly import("../spec/channel.js").Scalar[])[]} [values]
 * @returns {import("../types/selectionTypes.js").ProjectedSelection}
 */
export function createProjectedSelection(fields, values = []) {
    if (
        !Array.isArray(fields) ||
        fields.length !== 1 ||
        typeof fields[0] !== "string" ||
        !fields[0]
    ) {
        throw new Error(
            "Projected point selections require exactly one nonempty field."
        );
    }
    if (
        !Array.isArray(values) ||
        values.some(
            (tuple) =>
                !Array.isArray(tuple) ||
                tuple.length !== 1 ||
                !isSelectionValue(tuple[0])
        )
    ) {
        throw new Error(
            "Projected selection tuples must contain one finite scalar value."
        );
    }
    return {
        type: "projected",
        fields: [...fields],
        values: Array.from(
            new Set(values.map((tuple) => tuple[0])),
            (value) => [value]
        ),
    };
}

/** @param {unknown} value */
export function isSelectionValue(value) {
    return (
        typeof value === "string" ||
        typeof value === "boolean" ||
        (typeof value === "number" && Number.isFinite(value))
    );
}

/**
 * @param {import("../types/selectionTypes.js").ProjectedSelection} selection
 * @param {import("../spec/channel.js").Scalar | undefined | null} value
 * @param {boolean} toggle
 */
export function updateProjectedSelection(selection, value, toggle) {
    if (value == null) return createProjectedSelection(selection.fields);
    const values = toggle
        ? selection.values.filter((tuple) => tuple[0] !== value)
        : [];
    if (!toggle || values.length === selection.values.length)
        values.push([value]);
    return createProjectedSelection(selection.fields, values);
}

/**
 * @param {import("../types/selectionTypes.js").ProjectedSelection} selection
 * @param {unknown} value
 * @param {boolean} empty
 */
export function testProjectedSelection(selection, value, empty) {
    if (!selection.values.length) return empty;
    return selection.values.some((tuple) => tuple[0] === value);
}

/**
 * @param {import("../spec/parameter.js").Parameter} param
 * @returns {boolean}
 */
export function isLegendBound(param) {
    return "select" in param && param.bind === "legend";
}
