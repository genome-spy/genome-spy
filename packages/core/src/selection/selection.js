import { UNIQUE_ID_KEY } from "../data/transforms/identifier.js";
import {
    getSecondaryChannel,
    isPrimaryPositionalChannel,
} from "../encoder/encoder.js";
import { validateParameterName } from "../paramRuntime/paramUtils.js";
import { field } from "../utils/field.js";
import { asEventConfig } from "../utils/interactionConfig.js";

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
 * Resolves key tuples to a point selection value object.
 *
 * @param {"single" | "multi"} type
 * @param {string[]} keyFields
 * @param {import("../spec/channel.js").Scalar[][]} keyTuples
 * @param {(keyFields: string[], keyTuple: import("../spec/channel.js").Scalar[]) => import("../data/flowNode.js").Datum | undefined} resolveDatum
 * @returns {{ selection: import("../types/selectionTypes.js").SinglePointSelection | import("../types/selectionTypes.js").MultiPointSelection, unresolved: import("../spec/channel.js").Scalar[][] } | undefined}
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
    /** @type {import("../spec/channel.js").Scalar[][]} */
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
                return `(${paramName}.intervals.${channel} ? (${a} && ${b}) : ${empty})`;
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
 * Normalized representation of a selection predicate used by conditional
 * encodings. Keeping the names together lets renderers and other consumers
 * discover every dependency of a union without inspecting its expression.
 *
 * @typedef {{ params: string[], empty: boolean, singleParam: boolean }} SelectionPredicateInfo
 */

/**
 * Normalizes the single-selection `param` condition and the structured selection union.
 *
 * @param {import("../spec/channel.js").ParameterPredicate | import("../spec/channel.js").TestPredicate} condition
 * @returns {SelectionPredicateInfo | undefined}
 */
export function normalizeSelectionPredicate(condition) {
    if ("param" in condition) {
        return {
            params: [validateParameterName(condition.param)],
            empty: condition.empty ?? true,
            singleParam: true,
        };
    }
    if (!("test" in condition)) {
        return undefined;
    }

    const { selection, empty = true } = condition.test;
    if (selection.or.length === 0) {
        throw new Error('Selection test "or" must be a nonempty array.');
    }
    const params = Array.from(new Set(selection.or.map(validateParameterName)));
    return { params, empty, singleParam: false };
}

/**
 * Returns the names referenced by a normalized selection predicate.
 *
 * @param {import("../types/encoder.js").Predicate | undefined} predicate
 * @returns {string[]}
 */
export function getSelectionPredicateParams(predicate) {
    return predicate?.selection?.params ?? [];
}

/**
 * Collects appearance selections once per parameter. Union membership wins when
 * a parameter also appears in a single-param condition: with empty=false its
 * partial-interval membership includes the single-param membership.
 *
 * @param {Record<string, import("../types/encoder.js").Encoder>} encoders
 * @returns {Map<string, boolean>} Parameter to partial-interval semantics.
 */
export function collectAppearanceSelections(encoders) {
    const selections = new Map();
    for (const encoder of Object.values(encoders)) {
        for (const { predicate } of encoder.branches) {
            const info = predicate.selection;
            if (info) {
                for (const param of info.params) {
                    selections.set(
                        param,
                        selections.get(param) || !info.singleParam
                    );
                }
            }
        }
    }
    return selections;
}

/**
 * Creates the expression for the active state of one selection.
 *
 * @param {string} param
 * @param {import("../types/selectionTypes.js").Selection} selection
 * @returns {string}
 */
function makeSelectionEmptyExpression(param, selection) {
    if (isSinglePointSelection(selection)) {
        return `${param}.uniqueId == null`;
    }
    if (isMultiPointSelection(selection)) {
        return `${param}.data.size == 0`;
    }
    if (isIntervalSelection(selection)) {
        const channels = Object.keys(selection.intervals);
        return channels.length == 0
            ? "true"
            : `!(${channels.map((channel) => `${param}.intervals.${channel}`).join(" || ")})`;
    }
    throw new Error(`Unsupported selection type: ${selection.type}`);
}

/**
 * Creates a selection-membership expression using the union's partial interval
 * semantics: inactive dimensions do not constrain an active interval.
 *
 * @param {string} param
 * @param {import("../types/selectionTypes.js").Selection} selection
 * @param {Partial<Record<import("../spec/channel.js").PositionalChannel, string>>} fields
 * @param {"intersects" | "encloses" | "endpoints"} hitTestMode
 * @returns {string}
 */
function makeSelectionMembershipExpression(
    param,
    selection,
    fields,
    hitTestMode
) {
    if (isSinglePointSelection(selection)) {
        return `${param}.uniqueId != null && ${param}.uniqueId === datum[${JSON.stringify(
            UNIQUE_ID_KEY
        )}]`;
    }
    if (isMultiPointSelection(selection)) {
        return `${param}.data.size != 0 && mapHasKey(${param}.data, datum[${JSON.stringify(
            UNIQUE_ID_KEY
        )}])`;
    }
    if (isIntervalSelection(selection)) {
        const channels = Object.keys(selection.intervals);
        if (channels.length == 0) {
            return "false";
        }
        const access = (/** @type {string} */ f) =>
            `datum[${JSON.stringify(f)}]`;
        const dimensions = channels.map((channel) => {
            const secondary = getSecondaryChannel(channel);
            const f = fields[channel];
            const f2 = fields[secondary] ?? fields[channel];
            const interval = `${param}.intervals.${channel}`;
            const test =
                hitTestMode == "endpoints"
                    ? `((${interval}[0] <= ${access(f)} && ${access(f)} <= ${interval}[1]) || (${interval}[0] <= ${access(f2)} && ${access(f2)} <= ${interval}[1]))`
                    : hitTestMode == "encloses"
                      ? `(${interval}[0] <= ${access(f)} && ${access(f2)} <= ${interval}[1])`
                      : `(${interval}[0] <= ${access(f2)} && ${access(f)} <= ${interval}[1])`;
            return `(!${interval} || ${test})`;
        });
        const active = channels
            .map((channel) => `${param}.intervals.${channel}`)
            .join(" || ");
        return `!!(${active}) && (${dimensions.join(" && ")})`;
    }
    throw new Error(`Unsupported selection type: ${selection.type}`);
}

/**
 * Creates a union predicate expression. The `empty` option applies to the
 * group as a whole, so it only matches when every selection is empty.
 *
 * @param {{param: string, selection: import("../types/selectionTypes.js").Selection, fields: Partial<Record<import("../spec/channel.js").PositionalChannel, string>>}[]} entries
 * @param {boolean} empty
 * @param {"intersects" | "encloses" | "endpoints"} [hitTestMode="intersects"]
 * @returns {string}
 */
export function makeSelectionUnionTestExpression(
    entries,
    empty,
    hitTestMode = "intersects"
) {
    const membership = entries.map(({ param, selection, fields }) =>
        makeSelectionMembershipExpression(param, selection, fields, hitTestMode)
    );
    const anyMembership = `(${membership.join(" || ")})`;
    if (!empty) {
        return anyMembership;
    }
    const allEmpty = entries
        .map(({ param, selection }) =>
            makeSelectionEmptyExpression(param, selection)
        )
        .join(" && ");
    return `((${allEmpty}) || ${anyMembership})`;
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
        config.clear === false
            ? undefined
            : config.clear === true || config.clear == null
              ? { type: "dblclick" }
              : asEventConfig(config.clear);

    // Set some default
    if (isPointSelectionConfig(config) && config.on.type === "click") {
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
            interval[0] <= point[channel] &&
            interval[1] >= point[channel]
    );
}
