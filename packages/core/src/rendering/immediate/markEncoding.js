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
 * Prepares one axis for repeated projection during a synchronous mark
 * traversal. Constant encoders and scale band adjustments are evaluated when
 * the projection is prepared; data-dependent encoders remain in the returned
 * datum function.
 *
 * @param {import("../../view/layout/rectangle.js").default} coords
 * @param {Record<string, import("../../types/encoder.js").Encoder>} encoders
 * @param {"x" | "y"} axis
 * @param {object} firstDatum
 * @returns {(datum: object, result: [number, number]) => [number, number]}
 */
export function prepareRangeProjection(coords, encoders, axis, firstDatum) {
    const primary = encoders[axis];
    const secondary = encoders[axis + "2"];
    const primaryOffset = encoders[axis + "Offset"];
    const secondaryOffset = encoders[axis + "2Offset"];
    const coordinateSpan = axis == "x" ? coords.width : coords.height;
    const coordinateOrigin = axis == "x" ? coords.x : coords.y + coordinateSpan;
    const coordinateScale = axis == "x" ? coordinateSpan : -coordinateSpan;
    const primaryAdjustment = getPositionAdjustment(primary);
    const secondaryAdjustment = secondary
        ? getPositionAdjustment(secondary)
        : 0;
    const constantPrimary = primary.constant
        ? encodeNumber(primary, firstDatum) + primaryAdjustment
        : 0;
    const constantSecondary = secondary?.constant
        ? encodeNumber(secondary, firstDatum) + secondaryAdjustment
        : 0;
    const constantPrimaryOffset = primaryOffset.constant
        ? encodeNumber(primaryOffset, firstDatum)
        : 0;
    const constantSecondaryOffset =
        secondary && secondaryOffset?.constant
            ? encodeNumber(secondaryOffset, firstDatum)
            : 0;

    return (datum, result) => {
        const offset = primaryOffset.constant
            ? constantPrimaryOffset
            : encodeNumber(primaryOffset, datum);
        const primaryPosition = primary.constant
            ? constantPrimary
            : encodeNumber(primary, datum) + primaryAdjustment;
        const first =
            coordinateOrigin + primaryPosition * coordinateScale + offset;
        let second = first;
        if (secondary) {
            const secondaryPosition = secondary.constant
                ? constantSecondary
                : encodeNumber(secondary, datum) + secondaryAdjustment;
            const offset2 = secondaryOffset
                ? secondaryOffset.constant
                    ? constantSecondaryOffset
                    : encodeNumber(secondaryOffset, datum)
                : offset;
            second =
                coordinateOrigin +
                secondaryPosition * coordinateScale +
                offset2;
        }
        result[0] = first;
        result[1] = second;
        return result;
    };
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
    return encodeNumber(encoder, datum) + getPositionAdjustment(encoder);
}

/** @param {import("../../types/encoder.js").Encoder} encoder */
function getPositionAdjustment(encoder) {
    const scale = encoder.scale;

    if (!scale) {
        return 0;
    }

    const channelDef = encoder.channelDef;
    const band =
        channelDef && "band" in channelDef ? (channelDef.band ?? 0.5) : 0.5;

    if (scale.type == "band" || scale.type == "point") {
        const discreteScale = /** @type {{ bandwidth: () => number }} */ (
            /** @type {unknown} */ (scale)
        );
        return discreteScale.bandwidth() * band;
    } else if (scale.type == "index" || scale.type == "locus") {
        const genomicScale =
            /** @type {{
             *     step: () => number,
             *     bandwidth: () => number,
             *     align: () => number
             * }} */ (/** @type {unknown} */ (scale));
        const signedBandwidth =
            Math.sign(genomicScale.step()) * genomicScale.bandwidth();
        return signedBandwidth * (band - genomicScale.align());
    } else {
        return 0;
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
