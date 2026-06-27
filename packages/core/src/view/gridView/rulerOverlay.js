/**
 * @typedef {import("../../spec/channel.js").PrimaryPositionalChannel} PrimaryPositionalChannel
 * @typedef {{
 *   paramName: string,
 *   channels: PrimaryPositionalChannel[],
 *   mark?: import("../../spec/parameter.js").RulerMarkConfig
 * }} RulerOverlaySpecOptions
 */

/**
 * Creates a generated layer spec for rendering a ruler overlay.
 *
 * @param {RulerOverlaySpecOptions} options
 * @returns {import("../../spec/view.js").LayerSpec}
 */
export function createRulerOverlaySpec({ paramName, channels, mark = {} }) {
    /** @type {import("../../spec/view.js").LayerSpec} */
    const spec = {
        name: "rulerOverlay_" + paramName,
        domainInert: true,
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
                expr: makeRulerFilterExpression(paramName, channels),
            },
        ],
        encoding: {},
        layer: [],
    };

    for (const channel of channels) {
        spec.encoding[channel] = {
            expr: makeRulerPositionExpression(paramName, channel),
            type: null,
            title: null,
        };
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

    return spec;
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
 */
function makeRulerPositionExpression(paramName, channel) {
    return `linearize('${channel}', ${paramName}.values.${channel})`;
}
