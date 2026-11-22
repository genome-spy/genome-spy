import { primaryPositionalChannels } from "../../encoder/encoder.js";

export const INTERVAL_DRAG_ACTIVE_PARAM = "intervalDragActive";

/**
 * @typedef {import("../../spec/channel.js").PrimaryPositionalChannel} PrimaryPositionalChannel
 * @typedef {import("../../types/selectionTypes.js").IntervalSelection} IntervalSelection
 */

/**
 * @param {{
 *     scaleResolutionSource: { getScaleResolution: (channel: PrimaryPositionalChannel) => import("../../scales/scaleResolution.js").default },
 *     selectionExpression: string,
 *     selection: IntervalSelection,
 *     channels?: PrimaryPositionalChannel[],
 *     brushConfig?: import("../../spec/parameter.js").BrushConfig,
 * }} options
 * @returns {import("../../spec/view.js").LayerSpec}
 */
export function createSelectionRectSpec({
    scaleResolutionSource,
    selectionExpression,
    selection,
    channels = /** @type {PrimaryPositionalChannel[]} */ (
        Object.keys(selection.intervals)
    ),
    brushConfig = {},
}) {
    const { shadowInset, ...brushMarkProps } = brushConfig;
    delete brushMarkProps.zindex;

    if (primaryPositionalChannels.every((c) => !channels.includes(c))) {
        throw new Error(
            "SelectionRect requires at least one of the channels 'x' or 'y' to be present in the selection."
        );
    }

    const clip = channels.includes("x")
        ? channels.includes("y")
            ? true
            : "x"
        : "y";

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
            scaleResolutionSource,
            selectionExpression,
            "x",
            0
        );
        layerSpec.encoding.x2 = createIntervalBoundEncoding(
            scaleResolutionSource,
            selectionExpression,
            "x",
            1
        );
    }
    if (channels.includes("y")) {
        layerSpec.encoding.y = createIntervalBoundEncoding(
            scaleResolutionSource,
            selectionExpression,
            "y",
            0
        );
        layerSpec.encoding.y2 = createIntervalBoundEncoding(
            scaleResolutionSource,
            selectionExpression,
            "y",
            1
        );
    }

    layerSpec.layer.push({
        name: "selectionRectRect",
        mark: {
            type: "rect",
            style: "selection-brush",
            clip,
            cursor: brushMarkProps.cursor ?? {
                expr: `${INTERVAL_DRAG_ACTIVE_PARAM} ? 'grabbing' : 'move'`,
            },
            ...brushMarkProps,
            ...(shadowInset && { shadowOpacity: 0 }),
        },
    });

    if (shadowInset) {
        const {
            shadowColor = "black",
            shadowOpacity = 0.5,
            shadowBlur = 4,
        } = brushMarkProps;
        const depth =
            typeof shadowBlur === "number" ? shadowBlur : shadowBlur.expr;
        const strength =
            typeof shadowOpacity === "number"
                ? shadowOpacity
                : shadowOpacity.expr;
        const reversed = (/** @type {PrimaryPositionalChannel} */ axis) =>
            channels.includes(axis) &&
            scaleResolutionSource.getScaleResolution(axis).getScale().props
                ?.reverse;
        const xInward = reversed("x") ? -1 : 1;
        const yInward = reversed("y") ? 1 : -1;
        const spans = channels.map((axis) => {
            const lo = makeIntervalBoundExpression(
                selectionExpression,
                axis,
                0
            );
            const hi = makeIntervalBoundExpression(
                selectionExpression,
                axis,
                1
            );
            return `abs(scale('${axis}', ${hi}) - scale('${axis}', ${lo})) * ${axis === "x" ? "width" : "height"} / 2`;
        });
        const strokeWidth = `max(0, min((${depth}), ${spans.join(", ")})) / 3`;
        for (const [band, fade] of [1, 0.5, 0.2].entries()) {
            const inset = `(${strokeWidth}) * ${band + 0.5}`;
            const radii = Object.fromEntries(
                Object.entries(brushMarkProps)
                    .filter(
                        ([key, value]) =>
                            key.startsWith("cornerRadius") &&
                            value !== undefined
                    )
                    .map(([key, radius]) => [
                        key,
                        {
                            expr: `max(0, (${typeof radius === "number" ? radius : /** @type {import("../../spec/parameter.js").ExprRef} */ (radius).expr}) - (${inset}))`,
                        },
                    ])
            );
            layerSpec.layer.push({
                mark: {
                    type: "rect",
                    clip: brushMarkProps.clip ?? clip,
                    opacity: brushMarkProps.opacity,
                    ...radii,
                    fillOpacity: 0,
                    stroke: shadowColor,
                    strokeOpacity: { expr: `(${strength}) * ${fade}` },
                    strokeWidth: { expr: strokeWidth },
                    xOffset: { expr: `${xInward} * (${inset})` },
                    x2Offset: { expr: `${-xInward} * (${inset})` },
                    yOffset: { expr: `${yInward} * (${inset})` },
                    y2Offset: { expr: `${-yInward} * (${inset})` },
                    tooltip: null,
                },
            });
        }
    }

    const makeExpr = (/** @type {PrimaryPositionalChannel} */ channel) => {
        const resolution = scaleResolutionSource.getScaleResolution(channel);
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
                    ? createIntervalBoundEncoding(
                          scaleResolutionSource,
                          selectionExpression,
                          "y",
                          1
                      )
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
        ...channels.map((channel) => {
            const interval = `${selectionExpression}.intervals.${channel}`;
            return `${interval} != null && ${interval}[0] < ${interval}[1]`;
        }),
    ].join(" && ");
}

/**
 * @param {{ getScaleResolution: (channel: PrimaryPositionalChannel) => import("../../scales/scaleResolution.js").default }} scaleResolutionSource
 * @param {string} selectionExpression
 * @param {PrimaryPositionalChannel} channel
 * @param {0 | 1} index
 */
function createIntervalBoundEncoding(
    scaleResolutionSource,
    selectionExpression,
    channel,
    index
) {
    return /** @type {any} */ ({
        datum: {
            expr: makeIntervalBoundExpression(
                selectionExpression,
                channel,
                index
            ),
        },
        type: scaleResolutionSource.getScaleResolution(channel).type,
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
