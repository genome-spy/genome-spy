import clamp from "../../utils/clamp.js";
import { isExprRef } from "../../paramRuntime/paramUtils.js";
import { getScalePositionAdjustment } from "../../scales/scalePosition.js";
import { getGapPeer } from "../../marks/markUtils.js";

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
 * @param {boolean} [clampToView]
 * @returns {(datum: object, result: [number, number]) => [number, number]}
 */
export function prepareRangeProjection(
    coords,
    encoders,
    axis,
    firstDatum,
    clampToView = false
) {
    const primary = encoders[axis];
    const secondary = encoders[axis + "2"];
    const primaryOffset = encoders[axis + "Offset"];
    const secondaryOffset = encoders[axis + "2Offset"];
    const coordinateSpan = axis == "x" ? coords.width : coords.height;
    const coordinateOrigin = axis == "x" ? coords.x : coords.y + coordinateSpan;
    const coordinateScale = axis == "x" ? coordinateSpan : -coordinateSpan;
    const min = axis == "x" ? coords.x : coords.y;
    const max = min + coordinateSpan;
    const primaryAdjustment = getPositionAdjustment(primary);
    const secondaryAdjustment = secondary
        ? getPositionAdjustment(secondary)
        : 0;
    const primaryOffsetAdjustment = getPositionAdjustment(primaryOffset);
    const secondaryOffsetAdjustment = secondaryOffset
        ? getPositionAdjustment(secondaryOffset)
        : 0;
    const gapPrimary = createGapProjection(primary, coordinateSpan, secondary);
    const gapSecondary =
        secondary && createGapProjection(secondary, coordinateSpan, primary);
    const constantPrimary =
        primary.constant && !gapPrimary
            ? encodeNumber(primary, firstDatum) + primaryAdjustment
            : 0;
    const constantSecondary =
        secondary?.constant && !gapSecondary
            ? encodeNumber(secondary, firstDatum) + secondaryAdjustment
            : 0;
    const constantPrimaryOffset = primaryOffset.constant
        ? encodeNumber(primaryOffset, firstDatum) + primaryOffsetAdjustment
        : 0;
    const constantSecondaryOffset =
        secondary && secondaryOffset?.constant
            ? encodeNumber(secondaryOffset, firstDatum) +
              secondaryOffsetAdjustment
            : 0;

    return (datum, result) => {
        const offset = primaryOffset.constant
            ? constantPrimaryOffset
            : encodeNumber(primaryOffset, datum) + primaryOffsetAdjustment;
        const primaryPosition = gapPrimary
            ? gapPrimary(datum)
            : primary.constant
              ? constantPrimary
              : encodeNumber(primary, datum) + primaryAdjustment;
        const first =
            coordinateOrigin + primaryPosition * coordinateScale + offset;
        let second = first;
        if (secondary) {
            const secondaryPosition = gapSecondary
                ? gapSecondary(datum)
                : secondary.constant
                  ? constantSecondary
                  : encodeNumber(secondary, datum) + secondaryAdjustment;
            const offset2 = secondaryOffset
                ? secondaryOffset.constant
                    ? constantSecondaryOffset
                    : encodeNumber(secondaryOffset, datum) +
                      secondaryOffsetAdjustment
                : offset;
            second =
                coordinateOrigin +
                secondaryPosition * coordinateScale +
                offset2;
        }
        result[0] = clampToView ? clamp(first, min, max) : first;
        result[1] = clampToView ? clamp(second, min, max) : second;
        return result;
    };
}

/**
 * @param {import("../../types/encoder.js").Encoder} encoder
 * @param {object} datum
 */
export function encodeNumber(encoder, datum) {
    return /** @type {number} */ (encoder(datum));
}

/** @param {import("../../types/encoder.js").Encoder} encoder
 * @param {number} [extent]
 * @param {import("../../types/encoder.js").Encoder} [peer]
 */
function createGapProjection(encoder, extent, peer) {
    const scale = encoder.scale;
    if (!scale || !("gapMapping" in scale)) return;
    const indexScale =
        /** @type {import("../../genome/scaleIndex.js").ScaleIndex} */ (scale);
    const mapping = indexScale.gapMapping(extent);
    if (!mapping) return;

    const accessor = encoder.branches[0].accessor;
    const def = accessor.channelDef;
    const peerAccessor =
        peer && getGapPeer(encoder.channelDef) && peer.branches[0].accessor;
    const defaultBand = peerAccessor ? 0 : 0.5;
    const band = "band" in def ? (def.band ?? defaultBand) : defaultBand;

    return (/** @type {object} */ datum) => {
        const value = Number(accessor(datum));
        const before = !!peerAccessor && value > Number(peerAccessor(datum));
        return mapping.position(value, band, before);
    };
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

    return getScalePositionAdjustment(scale, band);
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
        ? mark.unitView.paramRuntime.evaluateAndGet(value)
        : value;
}

/** @param {import("../../spec/channel.js").Scalar} value */
export function toPaintString(value) {
    return value == null ? "none" : "" + value;
}
