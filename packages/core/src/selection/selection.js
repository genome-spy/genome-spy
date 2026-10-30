import { splitAccessPath } from "vega-util";
import { UNIQUE_ID_KEY } from "../data/transforms/identifier.js";
import {
    getSecondaryChannel,
    isPrimaryPositionalChannel,
} from "../encoder/encoder.js";
import { validateParameterName } from "../paramRuntime/paramUtils.js";
import { field } from "../utils/field.js";
import { asEventConfig } from "../utils/interactionConfig.js";
import {
    getSelectionPredicateTreeParams,
    normalizeSelectionPredicateTree,
} from "./selectionPredicateTree.js";
import {
    createCategorySelection,
    testCategorySelection,
} from "./categorySelection.js";

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
 * Returns key tuples for a point selection.
 *
 * @param {import("../types/selectionTypes.js").SinglePointSelection | import("../types/selectionTypes.js").MultiPointSelection} selection
 * @param {string[]} keyFields
 * @returns {import("../spec/channel.js").Scalar[][] | undefined}
 */
export function getPointSelectionKeyTuples(selection, keyFields) {
    if (!keyFields || keyFields.length === 0) {
        return;
    }

    const accessors = keyFields.map((fieldName) => field(fieldName));
    const toTuple = (
        /** @type {import("../data/flowNode.js").Datum} */ datum
    ) => accessors.map((accessor) => accessor(datum));

    if (isSinglePointSelection(selection)) {
        if (!selection.datum) {
            return [];
        }

        return [toTuple(selection.datum)];
    }

    if (isMultiPointSelection(selection)) {
        return [...selection.data.values()].map(toTuple);
    }

    throw new Error(
        `Expected a point selection, got: ${JSON.stringify(selection)}`
    );
}

/**
 * Resolves key tuples to a point selection value object without modifying them.
 *
 * @template {readonly import("../spec/channel.js").Scalar[]} T
 *
 * @param {"single" | "multi"} type
 * @param {string[]} keyFields
 * @param {readonly T[]} keyTuples
 * @param {(keyFields: string[], keyTuple: T) => import("../data/flowNode.js").Datum | undefined} resolveDatum
 * @returns {{ selection: import("../types/selectionTypes.js").SinglePointSelection | import("../types/selectionTypes.js").MultiPointSelection, unresolved: T[] } | undefined}
 */
export function resolvePointSelectionFromKeyTuples(
    type,
    keyFields,
    keyTuples,
    resolveDatum
) {
    if (!keyFields || keyFields.length === 0) {
        return;
    }

    if (type === "single" && keyTuples.length > 1) {
        throw new Error(
            "Single point selections expect at most one key tuple."
        );
    }

    /** @type {import("../data/flowNode.js").Datum[]} */
    const datums = [];
    /** @type {T[]} */
    const unresolved = [];

    for (const tuple of keyTuples) {
        const datum = resolveDatum(keyFields, tuple);
        if (datum) {
            datums.push(datum);
        } else {
            unresolved.push(tuple);
        }
    }

    const selection =
        type === "single"
            ? createSinglePointSelection(datums[0] ?? null)
            : createMultiPointSelection(datums);

    return { selection, unresolved };
}

/**
 *
 * @param {import("../spec/channel.js").ChannelWithScale[]} channels
 * @returns {import("../types/selectionTypes.js").IntervalSelection}
 */
export function createIntervalSelection(channels) {
    return {
        type: "interval",
        intervals: Object.fromEntries(
            channels.map((c) => [c, /** @type {number[]} */ (null)])
        ),
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
 * Returns a string expression that can be used to test if a datum is part of the selection.
 *
 * @param {import("../spec/transform.js").SelectionFilterParams} params
 * @param {import("../types/selectionTypes.js").Selection} selection
 */
export function makeSelectionTestExpression(params, selection) {
    const empty = !!(params.empty ?? true);
    const paramName = validateParameterName(params.param);
    const fields = params.fields ?? {};

    if (isCategorySelection(selection)) {
        if (Object.keys(fields).length !== 1 || !fields[selection.component]) {
            throw new Error(
                `Category filter fields must map the declared component "${selection.component}".`
            );
        }
        const access = splitAccessPath(fields[selection.component])
            .map((part) => `[${JSON.stringify(part)}]`)
            .join("");
        return `${paramName}.values.size == 0 ? ${empty} : mapHasKey(${paramName}.values, datum${access})`;
    }
    if (isSinglePointSelection(selection)) {
        return `${paramName}.uniqueId == null ? ${empty} : ${paramName}.uniqueId === datum[${JSON.stringify(
            UNIQUE_ID_KEY
        )}]`;
    } else if (isMultiPointSelection(selection)) {
        return `${paramName}.data.size == 0 ? ${empty} : mapHasKey(${paramName}.data, datum[${JSON.stringify(
            UNIQUE_ID_KEY
        )}])`;
    } else if (isIntervalSelection(selection)) {
        const channelsInSelection =
            /** @type {import("../spec/channel.js").PrimaryPositionalChannel[]} */ (
                Object.keys(selection.intervals)
            );

        const primaryChannelsInConfig = Object.keys(fields).filter(
            isPrimaryPositionalChannel
        );

        if (primaryChannelsInConfig.length === 0) {
            throw new Error(
                "Filtering using interval selections requires at least one primary positional channel in the config! " +
                    JSON.stringify(params)
            );
        }

        if (
            primaryChannelsInConfig.some(
                (c) => !channelsInSelection.includes(c)
            )
        ) {
            throw new Error(
                `Selection channels (${channelsInSelection.join(", ")}) do not match the fields: ${JSON.stringify(params)}!`
            );
        }

        const access = (/** @type {string} */ f) =>
            `datum[${JSON.stringify(f)}]`;

        const conditions = channelsInSelection
            .map((channel) => {
                const secondaryChannel = getSecondaryChannel(channel);
                const f = fields[channel];
                const f2 = fields[secondaryChannel] ?? fields[channel];

                // TODO: Implement different hit tests: "intersects" | "encloses" | "endpoints"
                // TODO: Implement tests
                const a = `${paramName}.intervals.${channel}[0] <= ${access(f2)}`;
                const b = `${access(f)} <= ${paramName}.intervals.${channel}[1]`;
                const nonzero = `${paramName}.intervals.${channel}[0] < ${paramName}.intervals.${channel}[1]`;
                return `(${paramName}.intervals.${channel} ? (${nonzero} && ${a} && ${b}) : ${empty})`;
            })
            .join(" && ");
        return conditions;
    } else {
        throw new Error(
            `Unrecognized selection type : ${JSON.stringify(selection)}`
        );
    }
}

/**
 * @typedef {import("./selectionPredicateTree.js").SelectionPredicateTree} SelectionPredicateInfo
 */

/**
 * Normalizes direct and structured selection conditions.
 *
 * @param {import("../spec/channel.js").ParameterPredicate | import("../spec/channel.js").TestPredicate} condition
 * @returns {SelectionPredicateInfo | undefined}
 */
export function normalizeSelectionPredicate(condition) {
    if (!("param" in condition) && !("test" in condition)) {
        return undefined;
    }
    return normalizeSelectionPredicateTree(condition);
}

/**
 * Returns the names referenced by a normalized selection predicate.
 *
 * @param {import("../types/encoder.js").Predicate | undefined} predicate
 * @returns {string[]}
 */
export function getSelectionPredicateParams(predicate) {
    return predicate?.selection
        ? getSelectionPredicateTreeParams(predicate.selection)
        : [];
}

/**
 * @param {Record<string, import("../types/encoder.js").Encoder>} encoders
 * @returns {import("./selectionPredicateTree.js").ResolvedSelectionPredicate[]}
 */
export function collectAppearanceSelections(encoders) {
    const roots = Object.values(encoders).flatMap((encoder) =>
        encoder.branches.flatMap(({ predicate }) =>
            predicate.selection ? [predicate.selection] : []
        )
    );
    const seen = new Set();
    return roots.filter((root) => {
        const key = JSON.stringify(root);
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

/**
 * @param {import("../types/selectionTypes.js").Selection} selection
 * @returns {selection is import("../types/selectionTypes.js").IntervalSelection}
 */
export function isIntervalSelection(selection) {
    return selection.type === "interval";
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
 * @returns {selection is import("../types/selectionTypes.js").CategoryPointSelection}
 */
export function isCategorySelection(selection) {
    return selection.type === "categories";
}

/** @param {import("../spec/parameter.js").PointSelectionConfig} select */
export function clearPointSelection(select) {
    return select.encodings
        ? createCategorySelection(select.encodings[0])
        : select.toggle
          ? createMultiPointSelection()
          : createSinglePointSelection(null);
}

/**
 * @param {import("../types/selectionTypes.js").Selection} selection
 * @param {string} component
 */
export function selectionValues(selection, component) {
    if (!isCategorySelection(selection)) {
        throw new Error("selectionValues requires a category point selection.");
    }
    if (selection.component !== component) {
        throw new Error(`Undeclared selection component "${component}".`);
    }
    return Array.from(selection.values);
}

/**
 * Tests raw category membership without materializing the selected values.
 *
 * @param {import("../types/selectionTypes.js").Selection} selection
 * @param {string} component
 * @param {unknown} value
 * @returns {boolean}
 */
export function selectionContains(selection, component, value) {
    if (!isCategorySelection(selection)) {
        throw new Error(
            "selectionContains requires a category point selection."
        );
    }
    if (selection.component !== component) {
        throw new Error(`Undeclared selection component "${component}".`);
    }
    return testCategorySelection(selection, value, false);
}

/**
 * @param {import("../types/selectionTypes.js").Selection} selection
 * @param {string} component
 */
export function selectionBounds(selection, component) {
    if (!isIntervalSelection(selection)) {
        throw new Error("selectionBounds requires an interval selection.");
    }
    if (!Object.hasOwn(selection.intervals, component)) {
        throw new Error(`Undeclared selection component "${component}".`);
    }
    const bounds = selection.intervals[/** @type {"x" | "y"} */ (component)];
    return bounds ? bounds.slice() : null;
}

/**
 * @param {import("../spec/parameter.js").SelectionTypeOrConfig} typeOrConfig
 * @param {"legend"} [bind]
 * @returns {import("../spec/parameter.js").SelectionConfig}
 */
export function asSelectionConfig(typeOrConfig, bind) {
    /** @type {import("../spec/parameter.js").SelectionConfig} */
    const config =
        typeof typeOrConfig === "string"
            ? { type: typeOrConfig }
            : { ...typeOrConfig };

    config.on = config.on
        ? asEventConfig(config.on)
        : isPointSelectionConfig(config)
          ? { type: "click" }
          : undefined;

    config.clear =
        config.clear === false || (bind === "legend" && config.clear == null)
            ? undefined
            : config.clear === true || config.clear == null
              ? { type: "dblclick" }
              : asEventConfig(config.clear);

    // Set some default
    if (
        isPointSelectionConfig(config) &&
        config.on.type === "click" &&
        config.toggle === undefined
    ) {
        config.toggle = true;
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

/**
 *
 * @param {import("../spec/parameter.js").SelectionConfig} config
 * @returns {config is import("../spec/parameter.js").IntervalSelectionConfig}
 */
export function isIntervalSelectionConfig(config) {
    return config && config.type == "interval";
}

/**
 * Returns whether a selection contributes membership to a union. This is
 * deliberately based on selection state, avoiding a row scan when all members
 * are empty.
 *
 * @param {import("../types/selectionTypes.js").Selection} selection
 * @returns {boolean}
 */
export function isSelectionActive(selection) {
    if (isSinglePointSelection(selection)) {
        return selection.uniqueId != null;
    }
    if (isMultiPointSelection(selection)) {
        return selection.data.size > 0;
    }
    if (isCategorySelection(selection)) {
        return selection.values.size > 0;
    }
    if (isIntervalSelection(selection)) {
        return isActiveIntervalSelection(selection);
    }
    throw new Error("Unsupported selection value.");
}

/**
 * @param {import("../types/selectionTypes.js").IntervalSelection} selection
 */
export function isActiveIntervalSelection(selection) {
    return Object.values(selection.intervals).some(
        (interval) => interval && interval.length === 2
    );
}

/**
 * @typedef {import("../types/selectionTypes.js").IntervalSelection} IntervalSelection
 * @typedef {Partial<Record<keyof IntervalSelection["intervals"], number>>} IntervalPoint
 * @param {IntervalSelection} selection
 * @param {IntervalPoint} point
 */
export function selectionContainsPoint(selection, point) {
    return Object.entries(selection.intervals).every(
        ([channel, interval]) =>
            (channel == "x" || channel == "y") &&
            interval &&
            interval[0] < interval[1] &&
            interval[0] <= point[channel] &&
            interval[1] >= point[channel]
    );
}
