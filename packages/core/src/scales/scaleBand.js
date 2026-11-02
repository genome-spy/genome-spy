/*!
 * Inverse-range lookup adapted from Vega:
 * https://github.com/vega/vega/blob/adf0ae7cd5dbc5bd0d7b4fb5566a68adf14cac3f/packages/vega-scale/src/scales/scaleBand.js
 *
 * Copyright (c) 2015-2023, University of Washington Interactive Data Lab
 * All rights reserved.
 * BSD-3-Clause License: https://github.com/vega/vega/blob/adf0ae7cd5dbc5bd0d7b4fb5566a68adf14cac3f/LICENSE
 */

import { bisectRight } from "d3-array";
import { InternMap } from "internmap";
import {
    gapRank,
    hasGroupingGaps,
    normalizeGapPositions,
} from "../genome/indexGapMapping.js";

/**
 * Adds grouping gaps while delegating native band/point semantics to Vega.
 * Numeric cuts address the active domain's dense ranks, not categorical IDs.
 *
 * @param {() => import("./scaleBand.js").NativeCategoricalScale} createNativeScale
 * @returns {import("./scaleBand.js").CategoricalGapScale}
 */
export default function scaleBand(createNativeScale) {
    const native = createNativeScale();
    let ranks = new InternMap(native.domain().map((value, i) => [value, i]));

    /** @type {readonly number[]} */
    let cuts = [];

    let width = 0;

    /** @type {() => number} */
    let axisLength = () => 1;

    /** @type {Map<number, import("./scaleBand.js").CategoricalGapMapping>} */
    const mappings = new Map();

    const scale = /** @type {import("./scaleBand.js").CategoricalGapScale} */ (
        Object.assign(
            (/** @type {import("../spec/channel.js").Scalar} */ value) =>
                getMapping()?.position(value) ?? native(value),
            native
        )
    );

    // Native state stays authoritative; setters only invalidate derived geometry.
    for (const key of [
        "domain",
        "range",
        "rangeRound",
        "round",
        "padding",
        "paddingInner",
        "paddingOuter",
        "align",
    ]) {
        const method = /** @type {any} */ (native)[key];
        if (!method) continue;
        /** @param {...any} args */
        const forward = (...args) => {
            const result = method(...args);
            if (result !== native) return result;
            mappings.clear();
            if (key === "domain") {
                ranks = new InternMap(
                    native.domain().map((value, i) => [value, i])
                );
            }
            return scale;
        };
        /** @type {any} */ (scale)[key] = forward;
    }

    /** @param {number} [extent] */
    function getMapping(extent) {
        const enabled = scale.props
            ? hasGroupingGaps(scale.props)
            : width > 0 && cuts.length > 0;
        if (!enabled) return;
        extent ??= axisLength();
        let mapping = mappings.get(extent);
        if (mapping) return mapping;

        const domain = native.domain();
        const rankLookup = ranks;
        const mappingCuts = cuts;
        const range = native.range();
        const reverse = range[1] < range[0];
        const low = Math.min(...range);
        const high = Math.max(...range);
        const gap = extent > 0 ? width / extent : 0;
        const totalGap = mappingCuts.length * gap;
        const fits = extent > 0 && high - low > totalGap;
        const compressed = native
            .copy()
            .range(reverse ? [high - totalGap, low] : [low, high - totalGap]);
        const bandwidth = fits ? compressed.bandwidth() : 0;

        /** @param {import("../spec/channel.js").Scalar} value @param {number} [band] */
        const position = (value, band = 0) => {
            const rank = rankLookup.get(value);
            if (rank === undefined) return;
            if (!fits) return NaN;
            const preceding = gapRank(mappingCuts, rank);
            return (
                compressed(value) +
                (reverse ? mappingCuts.length - preceding : preceding) * gap +
                bandwidth * band
            );
        };

        // Only inversion needs the ordered starts; drawing remains allocation-free.
        /** @type {number[] | undefined} */
        let starts;
        /** @param {readonly number[]} bounds */
        const invertRange = (bounds) => {
            if (
                !fits ||
                !domain.length ||
                bounds[0] == null ||
                bounds[1] == null
            )
                return;
            const lo = Math.min(bounds[0], bounds[1]);
            const hi = Math.max(bounds[0], bounds[1]);
            if (Number.isNaN(lo) || Number.isNaN(hi)) return;
            starts ??= (reverse ? domain.toReversed() : domain).map(
                (value) => /** @type {number} */ (position(value))
            );
            if (hi < starts[0] || lo > high) return;

            let a = Math.max(0, bisectRight(starts, lo) - 1);
            let b = lo === hi ? a : bisectRight(starts, hi) - 1;
            if (lo - starts[a] > bandwidth + 1e-10) ++a;
            if (reverse)
                [a, b] = [domain.length - 1 - b, domain.length - 1 - a];
            return a > b ? undefined : domain.slice(a, b + 1);
        };

        mapping = {
            position,
            invertRange,
            fits,
            step: fits ? compressed.step() : 0,
            bandwidth,
        };
        mappings.set(extent, mapping);
        return mapping;
    }

    scale.gapMapping = getMapping;
    scale.step = () => getMapping()?.step ?? native.step();
    scale.bandwidth = () => getMapping()?.bandwidth ?? native.bandwidth();
    scale.invertRange = (bounds) => {
        const mapping = getMapping();
        return mapping
            ? mapping.invertRange(bounds)
            : native.invertRange(bounds);
    };
    scale.invert = (value) => scale.invertRange([value, value])?.[0];

    // @ts-expect-error Getter/setter overloads.
    scale.gapPositions = function (positions) {
        if (!arguments.length) return cuts;
        cuts = normalizeGapPositions(positions);
        mappings.clear();
        return scale;
    };
    // @ts-expect-error Getter/setter overloads.
    scale.gapWidth = function (value) {
        if (!arguments.length) return width;
        if (value != null && (!Number.isFinite(value) || value < 0))
            throw new Error("Gap width must be a finite nonnegative number.");
        width = value ?? 0;
        mappings.clear();
        return scale;
    };
    // @ts-expect-error Getter/setter overloads.
    scale.axisLength = function (value) {
        if (!arguments.length) return axisLength();
        axisLength = typeof value === "function" ? value : () => value;
        mappings.clear();
        return scale;
    };

    scale.copy = () => {
        const copy = scaleBand(
            () =>
                /** @type {import("./scaleBand.js").NativeCategoricalScale} */ (
                    native.copy()
                )
        );
        copy.type = scale.type;
        copy.gapPositions(cuts).gapWidth(width).axisLength(axisLength);
        if (scale.props) copy.props = scale.props;
        return copy;
    };

    return scale;
}
