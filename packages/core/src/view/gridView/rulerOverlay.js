import { createGeneratedChromeOverlay } from "./generatedChromeOverlay.js";

/**
 * @typedef {import("../../spec/channel.js").PrimaryPositionalChannel} PrimaryPositionalChannel
 * @typedef {import("./generatedChromeOverlay.js").GeneratedChromeOverlay} RulerOverlayView
 * @typedef {{
 *   paramName: string,
 *   channels: PrimaryPositionalChannel[],
 *   display?: import("../../spec/parameter.js").RulerDisplay,
 *   mark?: import("../../spec/parameter.js").RulerMarkConfig
 * }} RulerOverlaySpecOptions
 * @typedef {RulerOverlaySpecOptions & {
 *   context: import("../../types/viewContext.js").default,
 *   layoutParent: import("../containerView.js").default,
 *   dataParent: import("../view.js").default,
 *   name: string,
 * }} RulerOverlayViewOptions
 */

/**
 * Creates a generated layer spec for rendering a ruler overlay.
 *
 * @param {RulerOverlaySpecOptions} options
 * @returns {import("../../spec/view.js").LayerSpec}
 */
export function createRulerOverlaySpec({
    paramName,
    channels,
    display = "line",
    mark = {},
}) {
    /** @type {import("../../spec/view.js").LayerSpec} */
    const spec = {
        name: "rulerOverlay_" + paramName,
        domainInert: true,
        resolve: {
            scale: {
                x: "forced",
                y: "forced",
            },
            axis: {
                x: "excluded",
                y: "excluded",
            },
        },
        data: { values: [{}] },
        transform: [
            {
                type: "filter",
                expr: makeRulerFilterExpression(paramName, channels),
            },
        ],
        encoding: {},
        layer: [],
    };

    if (display === "band") {
        const encoding = /** @type {any} */ (spec.encoding);
        for (const channel of channels) {
            spec.encoding[channel] = createExprEncoding(
                makeRulerPositionExpression(paramName, channel)
            );
            encoding[channel + "2"] = createExprEncoding(
                makeRulerBandEndExpression(paramName, channel)
            );
        }

        spec.layer.push({
            name: "rulerOverlayBand",
            mark: {
                type: "rect",
                clip: true,
                fill: "black",
                fillOpacity: 0.15,
                stroke: "black",
                strokeWidth: 1,
                ...mark,
                // Rulers are decorative and must not replace hovered data marks.
                tooltip: null,
            },
        });
    } else {
        for (const channel of channels) {
            const encoding = createExprEncoding(
                makeRulerPositionExpression(paramName, channel, display)
            );
            const ruleLayer = /** @type {any} */ ({
                name: "rulerOverlayRule" + channel.toUpperCase(),
                mark: {
                    type: "rule",
                    clip: true,
                    stroke: "black",
                    strokeWidth: 1,
                    opacity: 0.8,
                    ...mark,
                    // Rulers are decorative and must not replace hovered data marks.
                    tooltip: null,
                },
            });

            if (channels.length === 1) {
                spec.encoding[channel] = encoding;
            } else {
                ruleLayer.encoding = { [channel]: encoding };
            }

            spec.layer.push(ruleLayer);
        }
    }

    return spec;
}

/**
 * Creates a generated chrome view for rendering a ruler overlay.
 *
 * @param {RulerOverlayViewOptions} options
 * @returns {RulerOverlayView}
 */
export function createRulerOverlayView({
    paramName,
    channels,
    display,
    mark,
    context,
    layoutParent,
    dataParent,
    name,
}) {
    return createGeneratedChromeOverlay({
        spec: createRulerOverlaySpec({
            paramName,
            channels,
            display,
            mark,
        }),
        context,
        layoutParent,
        dataParent,
        name,
        zindex: mark?.zindex ?? 1,
    });
}

/**
 * Creates a ruler overlay from the user-facing ruler config and resolved scale.
 *
 * @param {Omit<RulerOverlayViewOptions, "display" | "mark"> & {
 *   config: import("../../spec/parameter.js").RulerConfig,
 *   scaleResolution: import("../../scales/scaleResolution.js").default,
 * }} options
 * @returns {RulerOverlayView}
 */
export function createConfiguredRulerOverlayView({
    config,
    scaleResolution,
    ...options
}) {
    return createRulerOverlayView({
        ...options,
        display: resolveRulerDisplay(
            scaleResolution.getResolvedScaleType(),
            config.snap,
            config.display
        ),
        mark: config.mark,
    });
}

/**
 * @param {string} scaleType
 * @param {import("../../spec/parameter.js").RulerSnap | undefined} snap
 * @param {import("../../spec/parameter.js").RulerDisplay} [display]
 * @returns {import("../../spec/parameter.js").RulerDisplay}
 */
export function resolveRulerDisplay(scaleType, snap, display) {
    if (display) {
        return display;
    } else if (
        (scaleType === "index" || scaleType === "locus") &&
        (snap === undefined || snap === "auto" || snap === "integer")
    ) {
        return "center";
    } else {
        return "line";
    }
}

/**
 * @param {string} expr
 */
function createExprEncoding(expr) {
    return /** @type {any} */ ({
        datum: { expr },
        axis: null,
        type: null,
        title: null,
    });
}

/**
 * @param {string} paramName
 * @param {PrimaryPositionalChannel[]} channels
 */
function makeRulerFilterExpression(paramName, channels) {
    return [
        paramName + ".type === 'ruler'",
        ...channels.map(
            (channel) => paramName + ".values." + channel + " != null"
        ),
    ].join(" && ");
}

/**
 * @param {string} paramName
 * @param {PrimaryPositionalChannel} channel
 * @param {import("../../spec/parameter.js").RulerDisplay} [display]
 */
function makeRulerPositionExpression(paramName, channel, display = "line") {
    const expr = `linearize('${channel}', ${paramName}.values.${channel})`;
    return display === "center" ? expr + " + 0.5" : expr;
}

/**
 * @param {string} paramName
 * @param {PrimaryPositionalChannel} channel
 */
function makeRulerBandEndExpression(paramName, channel) {
    return makeRulerPositionExpression(paramName, channel) + " + 1";
}
