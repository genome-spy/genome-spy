import { isContinuous } from "vega-scale";
import { getEncoderDataAccessor } from "../../encoder/encoder.js";
import { createBinningRangeIndexer } from "../../utils/binnedIndex.js";
import { resolveMarkProperty } from "../immediate/markEncoding.js";

/**
 * Returns a conservative horizontal pixel bound for positional offsets.
 *
 * @param {Partial<Record<string, import("../../types/encoder.js").Encoder>>} encoders
 * @returns {number | undefined}
 */
export function getXIndexOffsetBound(encoders) {
    const dx = getEncoderAbsoluteBound(encoders.dx);
    const x = getEncoderAbsoluteBound(encoders.xOffset);
    const x2 = getEncoderAbsoluteBound(encoders.x2Offset);
    return dx === undefined || x === undefined || x2 === undefined
        ? undefined
        : dx + Math.max(x, x2);
}

/**
 * Builds an index over a stable data batch. Native indices correspond
 * one-to-one with rows and may start at a nonzero packed-instance offset.
 *
 * @param {MarkXIndexSpec} spec
 * @param {object[]} data
 * @param {number} [nativeStart]
 */
export function buildMarkXIndex(spec, data, nativeStart = 0) {
    if (!data.length) {
        return undefined;
    }
    const binCount = Math.min(256, Math.ceil(Math.sqrt(data.length)));
    const indexer = createBinningRangeIndexer(
        binCount,
        /** @type {[number, number]} */ (spec.indexDomain),
        spec.xAccessor,
        spec.x2Accessor
    );
    data.forEach((datum, index) =>
        indexer(datum, nativeStart + index, nativeStart + index + 1)
    );
    return indexer.getIndex();
}

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
    const markType = mark.getType();
    if (markType !== "point" && markType !== "rect") {
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

    return {
        xAccessor,
        x2Accessor,
        scaleResolution,
        indexDomain: /** @type {[number, number]} */ ([
            zoomExtent[0],
            zoomExtent[1],
        ]),
        domainStartOffset: ["index", "locus"].includes(xEncoder.scale.type)
            ? -1
            : 0,
    };
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
    const offsetBound = getXIndexOffsetBound(encoders);
    if (offsetBound === undefined) {
        return undefined;
    }

    const minPickingSize = getPropertyNumber(mark, "minPickingSize", 0);
    if (minPickingSize === undefined) {
        return undefined;
    }

    const markType = mark.getType();
    if (markType === "point") {
        const size = getEncoderAbsoluteBound(encoders.size);
        const strokeWidth = getEncoderAbsoluteBound(encoders.strokeWidth);
        if (size === undefined || strokeWidth === undefined) {
            return undefined;
        }
        const visibleRadius =
            (Math.sqrt(size) / 2) * Math.SQRT2 + strokeWidth / 2;
        return offsetBound + Math.max(visibleRadius, minPickingSize / 2);
    } else if (markType === "rect") {
        const strokeWidth = getEncoderAbsoluteBound(encoders.strokeWidth);
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
    let bound = 0;
    for (const value of range) {
        if (!Number.isFinite(value)) {
            return undefined;
        }
        bound = Math.max(bound, Math.abs(value));
    }
    return bound;
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
 * @typedef {object} MarkXIndexSpec
 * @property {import("../../types/encoder.js").Accessor<number>} xAccessor
 * @property {import("../../types/encoder.js").Accessor<number> | undefined} x2Accessor
 * @property {import("../../scales/scaleResolution.js").default} scaleResolution
 * @property {[number, number]} indexDomain
 * @property {number} domainStartOffset
 */
