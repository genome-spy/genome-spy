import { UNIQUE_ID_KEY } from "../data/transforms/identifier.js";
import { validateParameterName } from "../view/paramMediator.js";

/**
 * @param {import("../data/flowNode.js").Datum} datum
 * @returns {import("../types/selectionTypes.js").SinglePointSelection}
 */
export function createSinglePointSelection(datum) {
    return {
        type: "single",
        datum,
        uniqueId: datum?.[UNIQUE_ID_KEY],
    };
}

/**
 * @param {import("../data/flowNode.js").Datum[]} [data]
 * @returns {import("../types/selectionTypes.js").MultiPointSelection}
 */
export function createMultiPointSelection(data) {
    data ??= [];
    return {
        type: "multi",
        data: new Map(data.map((d) => [d[UNIQUE_ID_KEY], d])),
    };
}

/**
 * Updates the backing data and returns a new instance of the selection object.
 * A new instance is required to trigger reactivity in parameters.
 *
 * @param {import("../types/selectionTypes.js").MultiPointSelection} selection
 * @param {Partial<Record<"add" | "remove" | "toggle", Iterable<import("../data/flowNode.js").Datum>>>} update
 * @returns {import("../types/selectionTypes.js").MultiPointSelection}
 */
export function updateMultiPointSelection(selection, { add, remove, toggle }) {
    const data = selection.data;

    for (const d of add ?? []) {
        data.set(d[UNIQUE_ID_KEY], d);
    }

    for (const d of remove ?? []) {
        data.delete(d[UNIQUE_ID_KEY]);
    }

    for (const d of toggle ?? []) {
        const id = d[UNIQUE_ID_KEY];
        if (data.has(id)) {
            data.delete(id);
        } else {
            data.set(id, d);
        }
    }

    return {
        type: "multi",
        // Note, the data map is reused for performance reasons.
        data,
    };
}

/**
 * @param {import("../types/selectionTypes.js").Selection} selection
 * @param {import("../data/flowNode.js").Datum} datum
 * @param {boolean} [empty] evaluate to true if the selection is empty
 */
export function selectionTest(selection, datum, empty = true) {
    if (!selection || !datum) {
        return false;
    }

    if (isSinglePointSelection(selection)) {
        return selection.uniqueId == null
            ? empty
            : selection.uniqueId === datum[UNIQUE_ID_KEY];
    } else if (isMultiPointSelection(selection)) {
        return selection.data.size == 0
            ? empty
            : selection.data.has(datum[UNIQUE_ID_KEY]); // TODO: Binary search
    } else {
        throw new Error("Not a selection: " + JSON.stringify(selection));
    }
}

/**
 * @param {{param: string, empty?: boolean}} params
 */
export function makeSelectionTestExpression(params) {
    return `selectionTest(${validateParameterName(params.param)}, datum, ${!!(
        params.empty ?? true
    )})`;
}

/**
 * @param {import("../types/selectionTypes.js").Selection} selection
 * @returns {selection is import("../types/selectionTypes.js").RangeSelection}
 */
export function isRangeSelection(selection) {
    return selection.type === "range";
}

/**
 * @param {import("../types/selectionTypes.js").Selection} selection
 * @returns {selection is import("../types/selectionTypes.js").SinglePointSelection}
 */
export function isSinglePointSelection(selection) {
    return selection.type === "single";
}

/**
 * @param {import("../types/selectionTypes.js").Selection} selection
 * @returns {selection is import("../types/selectionTypes.js").MultiPointSelection}
 */
export function isMultiPointSelection(selection) {
    return selection.type === "multi";
}

/**
 * @param {import("../types/selectionTypes.js").Selection} selection
 * @returns {selection is import("../types/selectionTypes.js").ProjectedSelection}
 */
export function isProjectedSelection(selection) {
    return selection.type === "projected";
}

/**
 * @param {import("../spec/parameter.js").SelectionTypeOrConfig} typeOrConfig
 * @returns {import("../spec/parameter.js").SelectionConfig}
 */
export function asSelectionConfig(typeOrConfig) {
    const config =
        typeof typeOrConfig === "string"
            ? { type: typeOrConfig }
            : typeOrConfig;

    // Set some default
    if (isPointSelectionConfig(config)) {
        config.on ??= "click";
        if (config.on === "click") {
            config.toggle = true;
        }
    }

    return config;
}

/**
 * @param {import("../spec/parameter.js").SelectionConfig} config
 * @returns {config is import("../spec/parameter.js").PointSelectionConfig}
 */
export function isPointSelectionConfig(config) {
    return config && config.type == "point";
}
