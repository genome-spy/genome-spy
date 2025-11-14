import { UNIQUE_ID_KEY } from "../data/transforms/identifier.js";
import {
    getSecondaryChannel,
    isPrimaryPositionalChannel,
} from "../encoder/encoder.js";
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

/**
 * @param {import("../spec/parameter.js").SelectionConfig["on"]} eventType
 * @returns {import("../spec/parameter.js").EventConfig}
 */
export function asEventConfig(eventType) {
    if (typeof eventType === "string") {
        const m = eventType.match(/^([a-zA-Z]+)(?:\[(.+)\])?$/);
        if (!m) {
            throw new Error(`Invalid event type string: ${eventType}`);
        }
        const [, type, filter] = m;
        /** @type {import("../spec/parameter.js").EventConfig} */
        const eventSpec = {
            type: /** @type {import("../spec/parameter.js").DomEventType} */ (
                type
            ),
        };
        if (filter) {
            eventSpec.filter = filter;
        }
        return eventSpec;
    } else {
        return eventType;
    }
}
