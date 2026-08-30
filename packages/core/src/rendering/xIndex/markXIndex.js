import { isContinuous } from "vega-scale";
import { getEncoderDataAccessor } from "../../encoder/encoder.js";
import { resolveMarkProperty } from "../immediate/markEncoding.js";

/**
 * Resolves the immutable data-side contract needed to build an x index.
 * Renderer-native ranges and cache state remain adapter-owned.
 *
 * @param {import("../../marks/mark.js").default} mark
 * @returns {MarkXIndexSpec | undefined}
 */
export function createMarkXIndexSpec(mark) {
    const xEncoder = mark.encoders?.x;
    const x2Encoder = mark.encoders?.x2;
    if (
        !xEncoder?.channelDef ||
        !("buildIndex" in xEncoder.channelDef) ||
        !xEncoder.channelDef.buildIndex ||
        !xEncoder.scale ||
        (!isContinuous(xEncoder.scale.type) &&
            !["index", "locus"].includes(xEncoder.scale.type)) ||
        xEncoder.branches.length !== 1
    ) {
        return undefined;
    }

    const xAccessor = getEncoderDataAccessor(xEncoder)?.asNumberAccessor();
    if (!xAccessor) {
        return undefined;
    }

    let x2Accessor;
    if (x2Encoder) {
        if (
            x2Encoder.scale !== xEncoder.scale ||
            x2Encoder.branches.length !== 1
        ) {
            return undefined;
        }
        x2Accessor = getEncoderDataAccessor(x2Encoder)?.asNumberAccessor();
        if (!x2Accessor) {
            return undefined;
        }
    }

    const scaleResolution = mark.unitView.getScaleResolution("x");
    const zoomExtent = scaleResolution?.zoomExtent;
    if (
        !scaleResolution ||
        !zoomExtent ||
        !Number.isFinite(zoomExtent[0]) ||
        !Number.isFinite(zoomExtent[1]) ||
        zoomExtent[1] <= zoomExtent[0]
    ) {
        return undefined;
    }

    return Object.freeze({
        xAccessor,
        x2Accessor,
        xEncoder,
        x2Encoder,
        scaleResolution,
        indexDomain: /** @type {readonly [number, number]} */ (
            Object.freeze([zoomExtent[0], zoomExtent[1]])
        ),
        domainStartOffset: ["index", "locus"].includes(xEncoder.scale.type)
            ? -1
            : 0,
    });
}

/**
 * Resolves the live conservative data-domain query. False instructs the
 * adapter to use its complete native range.
 *
 * @param {import("../../marks/mark.js").default} mark
 * @param {MarkXIndexSpec} spec
 * @param {[number, number]} targetDomain
 * @returns {boolean}
 */
export function resolveMarkXIndexQuery(mark, spec, targetDomain) {
    const scale = spec.scaleResolution.getScale();
    const domain = scale.domain();
    const axisLength = spec.scaleResolution.getAxisLength();
    if (
        domain.length !== 2 ||
        !Number.isFinite(domain[0]) ||
        !Number.isFinite(domain[1]) ||
        domain[1] <= domain[0] ||
        !Number.isFinite(axisLength) ||
        axisLength <= 0
    ) {
        return false;
    }

    const pixelEnvelope = resolvePixelEnvelope(mark);
    if (pixelEnvelope === undefined) {
        return false;
    }

    const margin = ((domain[1] - domain[0]) * pixelEnvelope) / axisLength;
    targetDomain[0] = domain[0] + spec.domainStartOffset - margin;
    targetDomain[1] = domain[1] + margin;
    return true;
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @returns {number | undefined}
 */
function resolvePixelEnvelope(mark) {
    const encoders =
        /** @type {Partial<Record<string, import("../../types/encoder.js").Encoder>>} */ (
            mark.encoders
        );
    const offsetBound = sumBounds([
        getEncoderAbsoluteBound(encoders.xOffset),
        getEncoderAbsoluteBound(encoders.x2Offset),
        getEncoderAbsoluteBound(encoders.dx),
    ]);
    if (offsetBound === undefined) {
        return undefined;
    }

    const minPickingSize = getPropertyNumber(mark, "minPickingSize", 0);
    if (minPickingSize === undefined) {
        return undefined;
    }

    const markType = mark.getType();
    if (markType === "point") {
        const size = getEncoderNonNegativeBound(encoders.size);
        const strokeWidth = getEncoderNonNegativeBound(encoders.strokeWidth);
        if (size === undefined || strokeWidth === undefined) {
            return undefined;
        }
        const visibleRadius =
            (Math.sqrt(size) / 2) * Math.SQRT2 + strokeWidth / 2;
        return offsetBound + Math.max(visibleRadius, minPickingSize / 2);
    } else if (markType === "rect") {
        const strokeWidth = getEncoderNonNegativeBound(encoders.strokeWidth);
        const minWidth = getPropertyNumber(mark, "minWidth", 0);
        const shadowBlur = getPropertyNumber(mark, "shadowBlur", 0);
        const shadowOffsetX = getPropertyNumber(mark, "shadowOffsetX", 0);
        if (
            strokeWidth === undefined ||
            minWidth === undefined ||
            shadowBlur === undefined ||
            shadowOffsetX === undefined
        ) {
            return undefined;
        }
        const edgePadding =
            Math.max(strokeWidth, minPickingSize) / 2 +
            shadowBlur +
            Math.abs(shadowOffsetX);
        return offsetBound + Math.max(minWidth / 2, 0.1) + edgePadding;
    }

    return undefined;
}

/**
 * @param {import("../../types/encoder.js").Encoder | undefined} encoder
 * @returns {number | undefined}
 */
function getEncoderAbsoluteBound(encoder) {
    if (!encoder) {
        return 0;
    }
    if (encoder.constant) {
        const value = encoder(/** @type {any} */ ({}));
        return Number.isFinite(value)
            ? Math.abs(/** @type {number} */ (value))
            : undefined;
    }
    if (!encoder.scale || encoder.scale.type === "null") {
        return undefined;
    }
    const range = encoder.scale.range();
    if (!range.every(Number.isFinite)) {
        return undefined;
    }
    return Math.max(...range.map((value) => Math.abs(value)));
}

/**
 * @param {import("../../types/encoder.js").Encoder | undefined} encoder
 */
function getEncoderNonNegativeBound(encoder) {
    const bound = getEncoderAbsoluteBound(encoder);
    return bound === undefined ? undefined : Math.max(0, bound);
}

/** @param {(number | undefined)[]} bounds */
function sumBounds(bounds) {
    return bounds.includes(undefined)
        ? undefined
        : /** @type {number[]} */ (bounds).reduce(
              (sum, value) => sum + value,
              0
          );
}

/**
 * @param {import("../../marks/mark.js").default} mark
 * @param {string} property
 * @param {number} fallback
 */
function getPropertyNumber(mark, property, fallback) {
    const properties = /** @type {Record<string, any>} */ (mark.properties);
    const value = resolveMarkProperty(mark, properties[property] ?? fallback);
    return Number.isFinite(value) ? Number(value) : undefined;
}

/**
 * @typedef {Readonly<{
 *     xAccessor: import("../../types/encoder.js").Accessor<number>,
 *     x2Accessor: import("../../types/encoder.js").Accessor<number> | undefined,
 *     xEncoder: import("../../types/encoder.js").Encoder,
 *     x2Encoder: import("../../types/encoder.js").Encoder | undefined,
 *     scaleResolution: import("../../scales/scaleResolution.js").default,
 *     indexDomain: readonly [number, number],
 *     domainStartOffset: number,
 * }>} MarkXIndexSpec
 */
