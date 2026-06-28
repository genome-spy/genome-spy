import { isHConcatSpec, isVConcatSpec } from "../viewSpecGuards.js";

/**
 * @typedef {import("../../spec/channel.js").PrimaryPositionalChannel} PrimaryPositionalChannel
 * @typedef {"view" | "container"} RulerOverlayExtent
 * @typedef {{
 *   paramName: string,
 *   channels: PrimaryPositionalChannel[],
 *   display?: import("../../spec/parameter.js").RulerDisplay,
 *   mark?: import("../../spec/parameter.js").RulerMarkConfig
 * }} RulerOverlaySpecOptions
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
                opacity: 0.12,
                ...mark,
            },
        });
    } else {
        for (const channel of channels) {
            spec.encoding[channel] = createExprEncoding(
                makeRulerPositionExpression(paramName, channel, display)
            );
            spec.layer.push({
                name: "rulerOverlayRule" + channel.toUpperCase(),
                mark: {
                    type: "rule",
                    clip: true,
                    stroke: "black",
                    strokeWidth: 1,
                    opacity: 0.8,
                    ...mark,
                },
            });
        }
    }

    return spec;
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
 * Resolves whether a generated ruler overlay should be per-view or
 * container-spanning.
 *
 * @param {{
 *     paramName: string,
 *     config: import("../../spec/parameter.js").RulerConfig,
 *     ownerSpec: import("../../spec/view.js").ViewSpec,
 *     channels: PrimaryPositionalChannel[],
 *     isAligned: (channel: PrimaryPositionalChannel) => boolean,
 * }} options
 * @returns {RulerOverlayExtent}
 */
export function resolveRulerOverlayExtent({
    paramName,
    config,
    ownerSpec,
    channels,
    isAligned,
}) {
    const channel = channels.length === 1 ? channels[0] : undefined;
    if (!channel) {
        return "view";
    }

    const requestsContainer =
        config.extent === "container" || config.extent === "auto";
    if (!requestsContainer) {
        return "view";
    }

    const supportsContainer =
        (channel === "x" && isVConcatSpec(ownerSpec)) ||
        (channel === "y" && isHConcatSpec(ownerSpec));

    if (!supportsContainer) {
        if (config.extent === "container") {
            throw new Error(
                `Ruler param "${paramName}" cannot use extent "container" for channel "${channel}" in this view.`
            );
        } else {
            return "view";
        }
    }

    if (!isAligned(channel)) {
        if (config.extent === "container") {
            throw new Error(
                `Ruler param "${paramName}" cannot use extent "container" because its ${channel} projections do not align.`
            );
        } else {
            return "view";
        }
    }

    return "container";
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
