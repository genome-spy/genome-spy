import { isContinuous } from "vega-scale";
import { getEncoderDataAccessor } from "../../encoder/encoder.js";
import { createBinningRangeIndexer } from "../../utils/binnedIndex.js";

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
 * @param {MarkXIndexSpec} spec
 * @param {[number, number]} targetDomain
 * @returns {boolean}
 */
export function resolveMarkXIndexQuery(spec, targetDomain) {
    const scale = spec.scaleResolution.getScale();
    const domain = scale.domain();
    if (
        domain.length !== 2 ||
        !Number.isFinite(domain[0]) ||
        !Number.isFinite(domain[1]) ||
        domain[1] <= domain[0]
    ) {
        return false;
    }

    const span = domain[1] - domain[0];
    targetDomain[0] = domain[0] + spec.domainStartOffset - span;
    targetDomain[1] = domain[1] + span;
    return true;
}

/**
 * @typedef {object} MarkXIndexSpec
 * @property {import("../../types/encoder.js").Accessor<number>} xAccessor
 * @property {import("../../types/encoder.js").Accessor<number> | undefined} x2Accessor
 * @property {import("../../scales/scaleResolution.js").default} scaleResolution
 * @property {[number, number]} indexDomain
 * @property {number} domainStartOffset
 */
