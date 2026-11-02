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
import { bandSpace } from "vega-scale";
import {
    gapRank,
    installGroupingGapProperties,
} from "../genome/indexGapMapping.js";

/**
 * Adds grouping gaps while delegating native band/point semantics to Vega.
 * Numeric cuts address the active domain's dense ranks, not categorical IDs.
 *
 * @param {import("./scaleBand.js").NativeCategoricalScale} native
 * @returns {import("./scaleBand.js").CategoricalGapScale}
 */
export default function scaleBand(native) {
    /** @type {Map<number, import("./scaleBand.js").CategoricalGapMapping>} */
    const mappings = new Map();

    const scale = /** @type {import("./scaleBand.js").CategoricalGapScale} */ (
        Object.assign(
            (/** @type {import("../spec/channel.js").Scalar} */ value) =>
                getMapping()?.position(value) ?? native(value),
            native
        )
    );
    const gaps = installGroupingGapProperties(scale, () => mappings.clear());

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
            return scale;
        };
        /** @type {any} */ (scale)[key] = forward;
    }

    /** @param {number} [extent] */
    function getMapping(extent) {
        if (!gaps.enabled()) return;
        extent ??= gaps.axisLength();
        let mapping = mappings.get(extent);
        if (mapping) return mapping;

        const domain = native.domain();
        const cuts = gaps.positions;
        const range = native.range();
        const reverse = range[1] < range[0];
        const low = Math.min(...range);
        const high = Math.max(...range);
        const gap = extent > 0 ? gaps.width / extent : 0;
        const totalGap = cuts.length * gap;
        const fits = extent > 0 && high - low > totalGap;
        const factor = fits ? (high - low - totalGap) / (high - low) : 0;
        const bandwidth = fits ? native.bandwidth() * factor : 0;

        // With rounding disabled, compressing the native range is affine. Cache
        // final starts once for both lookup and inversion, including their gaps.
        const starts = domain.map((value, rank) => {
            const preceding = gapRank(cuts, rank);
            return fits
                ? low +
                      (native(value) - low) * factor +
                      (reverse ? cuts.length - preceding : preceding) * gap
                : NaN;
        });
        const lookup = new InternMap(
            domain.map((value, rank) => [value, starts[rank]])
        );
        if (reverse) starts.reverse();

        /** @param {import("../spec/channel.js").Scalar} value @param {number} [band] */
        const position = (value, band = 0) => {
            const start = lookup.get(value);
            return start === undefined ? undefined : start + bandwidth * band;
        };

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
            step: fits ? native.step() * factor : 0,
            bandwidth,
        };
        mappings.set(extent, mapping);
        return mapping;
    }

    scale.gapMapping = getMapping;
    scale.sizeForStep = (step) => {
        const n = native.domain().length;
        const inner = native.paddingInner?.() ?? 1;
        return n
            ? step * bandSpace(n, inner, native.paddingOuter()) +
                  (gaps.enabled() ? gaps.width * gaps.positions.length : 0)
            : 0;
    };
    scale.step = () => getMapping()?.step ?? native.step();
    scale.bandwidth = () => getMapping()?.bandwidth ?? native.bandwidth();
    scale.invertRange = (bounds) => {
        const mapping = getMapping();
        return mapping
            ? mapping.invertRange(bounds)
            : native.invertRange(bounds);
    };
    scale.invert = (value) => scale.invertRange([value, value])?.[0];

    scale.copy = () => {
        const copy = scaleBand(
            /** @type {import("./scaleBand.js").NativeCategoricalScale} */ (
                native.copy()
            )
        );
        copy.type = scale.type;
        copy.gapPositions(gaps.positions)
            .gapWidth(gaps.width)
            .axisLength(gaps.axisLength);
        if (scale.props) copy.props = scale.props;
        return copy;
    };

    return scale;
}
