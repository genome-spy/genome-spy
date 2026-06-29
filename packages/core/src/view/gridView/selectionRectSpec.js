import { primaryPositionalChannels } from "../../encoder/encoder.js";

export const INTERVAL_DRAG_ACTIVE_PARAM = "intervalDragActive";

/**
 * @typedef {import("../../spec/channel.js").PrimaryPositionalChannel} PrimaryPositionalChannel
 * @typedef {import("../../types/selectionTypes.js").IntervalSelection} IntervalSelection
 */

/**
 * @param {{
 *     gridChild: import("./gridChild.js").default,
 *     selectionExpression: string,
 *     selection: IntervalSelection,
 *     brushConfig?: import("../../spec/parameter.js").BrushConfig,
 * }} options
 * @returns {import("../../spec/view.js").LayerSpec}
 */
export function createSelectionRectSpec({
    gridChild,
    selectionExpression,
    selection,
    brushConfig = {},
}) {
    const channels = Object.keys(selection.intervals);
    const brushMarkProps = { ...brushConfig };
    delete brushMarkProps.zindex;

    if (primaryPositionalChannels.every((c) => !channels.includes(c))) {
        throw new Error(
            "SelectionRect requires at least one of the channels 'x' or 'y' to be present in the selection."
        );
    }

    /** @type {import("../../spec/view.js").LayerSpec} */
    const layerSpec = {
        name: "selectionRect",
        domainInert: true,
        params: [
            {
                name: INTERVAL_DRAG_ACTIVE_PARAM,
                value: false,
            },
        ],
        resolve: {
            scale: {
                x: "forced",
                y: "forced",
            },
        },
        data: { values: [{}] },
        transform: [
            {
                type: "filter",
                expr: makeSelectionRectFilterExpression(
                    selectionExpression,
                    channels
                ),
            },
        ],
        encoding: {},
        layer: [],
    };

    if (channels.includes("x")) {
        layerSpec.encoding.x = createIntervalBoundEncoding(
            selectionExpression,
            "x",
            0
        );
        layerSpec.encoding.x2 = createIntervalBoundEncoding(
            selectionExpression,
            "x",
            1
        );
    }
    if (channels.includes("y")) {
        layerSpec.encoding.y = createIntervalBoundEncoding(
            selectionExpression,
            "y",
            0
        );
        layerSpec.encoding.y2 = createIntervalBoundEncoding(
            selectionExpression,
            "y",
            1
        );
    }

    layerSpec.layer.push({
        name: "selectionRectRect",
        mark: {
            type: "rect",
            clip: true,
            ...{
                fill: "#808080",
                fillOpacity: 0.05,
                stroke: "black",
                strokeWidth: 1,
                strokeOpacity: 0.2,
                cursor: brushMarkProps.cursor ?? {
                    expr: `${INTERVAL_DRAG_ACTIVE_PARAM} ? 'grabbing' : 'move'`,
                },
                ...brushMarkProps,
            },
        },
    });

    const makeExpr = (/** @type {PrimaryPositionalChannel} */ channel) => {
        const resolution = gridChild.view.getScaleResolution(channel);
        return (
            `format(${selectionExpression}.intervals.${channel}[1] - ${selectionExpression}.intervals.${channel}[0], '.3s')` +
            (resolution.type === "locus" ? " + 'b'" : "")
        );
    };

    const labelOffset =
        brushConfig.measure == "inside"
            ? 9
            : brushConfig.measure == "outside"
              ? -9
              : 0;

    if (channels.includes("x") && labelOffset != 0) {
        layerSpec.layer.push({
            name: "selectionRectTextX",
            mark: {
                type: "text",
                align: "center",
                paddingX: 5,
                dy: labelOffset,
                tooltip: null,
            },
            encoding: {
                text: { expr: makeExpr("x") },
                y: channels.includes("y")
                    ? createIntervalBoundEncoding(selectionExpression, "y", 1)
                    : {
                          value: 1,
                      },
                y2: null,
            },
        });
    }

    if (channels.includes("y") && labelOffset != 0) {
        layerSpec.layer.push({
            name: "selectionRectTextY",
            mark: {
                type: "text",
                align: "center",
                paddingY: 5,
                dy: labelOffset,
                tooltip: null,
                angle: -90,
            },
            encoding: {
                text: { expr: makeExpr("y") },
                x2: null,
            },
        });
    }

    return layerSpec;
}

/**
 * @param {string} selectionExpression
 * @param {string[]} channels
 */
function makeSelectionRectFilterExpression(selectionExpression, channels) {
    return [
        selectionExpression + ".type === 'interval'",
        ...channels.map(
            (channel) =>
                selectionExpression + ".intervals." + channel + " != null"
        ),
    ].join(" && ");
}

/**
 * @param {string} selectionExpression
 * @param {PrimaryPositionalChannel} channel
 * @param {0 | 1} index
 */
function createIntervalBoundEncoding(selectionExpression, channel, index) {
    return /** @type {any} */ ({
        datum: {
            expr: makeIntervalBoundExpression(
                selectionExpression,
                channel,
                index
            ),
        },
        type: null,
        title: null,
    });
}

/**
 * @param {string} selectionExpression
 * @param {PrimaryPositionalChannel} channel
 * @param {0 | 1} index
 */
function makeIntervalBoundExpression(selectionExpression, channel, index) {
    const interval = `${selectionExpression}.intervals.${channel}`;
    return `(${interval} != null ? ${interval}[${index}] : 0)`;
}
