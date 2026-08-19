import { isExprRef } from "../../paramRuntime/paramUtils.js";

/**
 * @param {import("../../view/layout/rectangle.js").default} coords
 * @param {number} value
 * @param {number} offset
 */
export function projectX(coords, value, offset) {
    return coords.x + value * coords.width + offset;
}

/**
 * @param {import("../../view/layout/rectangle.js").default} coords
 * @param {number} value
 * @param {number} offset
 */
export function projectY(coords, value, offset) {
    return coords.y + (1 - value) * coords.height + offset;
}

/**
 * Projects the primary and optional secondary x positions of a mark. The
 * secondary offset inherits the primary offset when it has no encoder.
 *
 * @param {import("../../view/layout/rectangle.js").default} coords
 * @param {Record<string, import("../../types/encoder.js").Encoder>} encoders
 * @param {object} datum
 * @param {[number, number]} [result]
 * @returns {[number, number]}
 */
export function projectXRange(
    coords,
    encoders,
    datum,
    result = /** @type {[number, number]} */ ([0, 0])
) {
    return projectRange(
        coords,
        encoders.x,
        encoders.x2,
        encoders.xOffset,
        encoders.x2Offset,
        datum,
        projectX,
        result
    );
}

/**
 * Projects the primary and optional secondary y positions of a mark. The
 * secondary offset inherits the primary offset when it has no encoder.
 *
 * @param {import("../../view/layout/rectangle.js").default} coords
 * @param {Record<string, import("../../types/encoder.js").Encoder>} encoders
 * @param {object} datum
 * @param {[number, number]} [result]
 * @returns {[number, number]}
 */
export function projectYRange(
    coords,
    encoders,
    datum,
    result = /** @type {[number, number]} */ ([0, 0])
) {
    return projectRange(
        coords,
        encoders.y,
        encoders.y2,
        encoders.yOffset,
        encoders.y2Offset,
        datum,
        projectY,
        result
    );
}

/**
 * @param {import("../../view/layout/rectangle.js").default} coords
 * @param {import("../../types/encoder.js").Encoder} primary
 * @param {import("../../types/encoder.js").Encoder | undefined} secondary
 * @param {import("../../types/encoder.js").Encoder} primaryOffset
 * @param {import("../../types/encoder.js").Encoder | undefined} secondaryOffset
 * @param {object} datum
 * @param {(coords: import("../../view/layout/rectangle.js").default, value: number, offset: number) => number} project
 * @param {[number, number]} result
 * @returns {[number, number]}
 */
function projectRange(
    coords,
    primary,
    secondary,
    primaryOffset,
    secondaryOffset,
    datum,
    project,
    result
) {
    const offset = encodeNumber(primaryOffset, datum);
    const first = project(coords, encodePosition(primary, datum), offset);
    const second = secondary
        ? project(
              coords,
              encodePosition(secondary, datum),
              secondaryOffset ? encodeNumber(secondaryOffset, datum) : offset
          )
        : first;
    result[0] = first;
    result[1] = second;
    return result;
}

/**
 * @param {import("../../types/encoder.js").Encoder} encoder
 * @param {object} datum
 */
export function encodeNumber(encoder, datum) {
    return /** @type {number} */ (encoder(datum));
}

/**
 * Encodes a positional channel in unit coordinates, including placement within
 * a discrete scale band. D3 band scales return the start of a band, whereas
 * the WebGL scale functions also apply the channel definition's `band` value.
 *
 * @param {import("../../types/encoder.js").Encoder} encoder
 * @param {object} datum
 */
export function encodePosition(encoder, datum) {
    const basePosition = encodeNumber(encoder, datum);
    const scale = encoder.scale;

    if (!scale) {
        return basePosition;
    }

    const channelDef = encoder.channelDef;
    const band =
        channelDef && "band" in channelDef ? (channelDef.band ?? 0.5) : 0.5;

    if (scale.type == "band" || scale.type == "point") {
        const discreteScale = /** @type {{ bandwidth: () => number }} */ (
            /** @type {unknown} */ (scale)
        );
        return basePosition + discreteScale.bandwidth() * band;
    } else if (scale.type == "index" || scale.type == "locus") {
        const genomicScale =
            /** @type {{
             *     step: () => number,
             *     bandwidth: () => number,
             *     align: () => number
             * }} */ (/** @type {unknown} */ (scale));
        const signedBandwidth =
            Math.sign(genomicScale.step()) * genomicScale.bandwidth();
        return basePosition + signedBandwidth * (band - genomicScale.align());
    } else {
        return basePosition;
    }
}

/**
 * @param {import("../../types/encoder.js").Encoder} encoder
 * @param {object} datum
 */
export function encodeString(encoder, datum) {
    return toPaintString(encoder(datum));
}

/**
 * Resolves the current value of an expression-valued mark property.
 *
 * @template T
 * @param {import("../../marks/mark.js").default} mark
 * @param {T | import("../../spec/parameter.js").ExprRef} value
 * @returns {T}
 */
export function resolveMarkProperty(mark, value) {
    return isExprRef(value)
        ? mark.unitView.paramRuntime.evaluateAndGet(value.expr)
        : value;
}

/** @param {import("../../spec/channel.js").Scalar} value */
export function toPaintString(value) {
    return value == null ? "none" : "" + value;
}
