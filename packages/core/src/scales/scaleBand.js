/*!
 * Band/point layout and inversion adapted from Vega:
 * https://github.com/vega/vega/blob/adf0ae7cd5dbc5bd0d7b4fb5566a68adf14cac3f/packages/vega-scale/src/scales/scaleBand.js
 *
 * Copyright (c) 2015-2023, University of Washington Interactive Data Lab
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holder nor the names of its contributors
 *    may be used to endorse or promote products derived from this software
 *    without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

import { bisectRight } from "d3-array";
import { scaleOrdinal } from "d3-scale";
import { bandSpace } from "vega-scale";
import clamp from "../utils/clamp.js";
import {
    gapRank,
    installGroupingGapProperties,
} from "../genome/indexGapMapping.js";

/**
 * Band layout with occurrence-local grouping gaps. Numeric cuts address the
 * active domain's dense ranks; scale resolution owns category-to-cut conversion.
 * @returns {import("./scaleBand.js").CategoricalGapScale}
 */
export default function scaleBand() {
    /** @type {import("d3-scale").ScaleOrdinal<import("../spec/channel.js").Scalar, number, undefined>} */
    const ordinal = scaleOrdinal().unknown(undefined);
    let range = [0, 1];
    let round = false;
    const padding = { paddingInner: 0, paddingOuter: 0, align: 0.5 };

    /** @type {Map<number | undefined, import("./scaleBand.js").CategoricalGapMapping>} */
    const mappings = new Map();
    const scale = /** @type {import("./scaleBand.js").CategoricalGapScale} */ (
        (/** @type {import("../spec/channel.js").Scalar} */ value) =>
            getMapping().position(value)
    );
    const gaps = installGroupingGapProperties(scale, invalidate);

    function invalidate() {
        mappings.clear();
        return scale;
    }

    // @ts-expect-error Getter/setter overloads.
    scale.domain = function (values) {
        if (!arguments.length) return ordinal.domain();
        ordinal.domain(values);
        return invalidate();
    };
    // @ts-expect-error Getter/setter overloads.
    scale.range = function (values) {
        if (!arguments.length) return range.slice();
        const [start, end] = values;
        range = [+start, +end];
        return invalidate();
    };
    scale.rangeRound = (values) => scale.range(values).round(true);
    // @ts-expect-error Getter/setter overloads.
    scale.round = function (value) {
        if (!arguments.length) return round;
        round = !!value;
        return invalidate();
    };
    for (const key of /** @type {const} */ ([
        "paddingInner",
        "paddingOuter",
        "align",
    ])) {
        /** @param {number} value */
        const property = function (value) {
            if (!arguments.length) return padding[key];
            padding[key] = clamp(value);
            return invalidate();
        };
        // @ts-expect-error Getter/setter overloads.
        scale[key] = property;
    }
    // @ts-expect-error Getter/setter overloads.
    scale.padding = function (value) {
        if (!arguments.length) return padding.paddingInner;
        padding.paddingInner = padding.paddingOuter = clamp(value);
        return invalidate();
    };

    /** Ordinary geometry has its own cache entry and never reads layout extent.
     * @param {number} [extent]
     */
    function getMapping(extent) {
        const enabled = gaps.enabled();
        extent = enabled ? (extent ?? gaps.axisLength()) : undefined;
        let mapping = mappings.get(extent);
        if (mapping) return mapping;

        const domain = ordinal.domain();
        const n = domain.length;
        const { paddingInner, paddingOuter, align } = padding;
        const cuts = enabled ? gaps.positions : [];
        const reverse = range[1] < range[0];
        const low = Math.min(...range);
        const high = Math.max(...range);
        const gap = extent > 0 ? gaps.width / extent : 0;
        const available = high - low - cuts.length * gap;
        const fits = !enabled || (extent > 0 && available > 0);
        let step =
            (fits ? available : 0) /
            (bandSpace(n, paddingInner, paddingOuter) || 1);
        if (round) step = Math.floor(step);
        let start = low + (available - step * (n - paddingInner)) * align;
        let bandwidth = step * (1 - paddingInner);
        if (round) {
            start = Math.round(start);
            bandwidth = Math.round(bandwidth);
        }
        const starts = domain.map((value, rank) => {
            const preceding = gapRank(cuts, rank);
            return fits
                ? start +
                      (reverse ? n - 1 - rank : rank) * step +
                      (reverse ? cuts.length - preceding : preceding) * gap
                : NaN;
        });
        const lookup = ordinal.copy().range(starts);
        if (reverse) starts.reverse();

        /** @param {import("../spec/channel.js").Scalar} value @param {number} [band] */
        const position = (value, band = 0) => {
            const start = lookup(value);
            return start === undefined ? undefined : start + bandwidth * band;
        };
        /** @param {readonly number[]} bounds */
        const invertRange = (bounds) => {
            if (
                !fits ||
                (enabled && !n) ||
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
            if (reverse) [a, b] = [n - 1 - b, n - 1 - a];
            return a > b ? undefined : domain.slice(a, b + 1);
        };
        mapping = { position, invertRange, fits, step, bandwidth };
        mappings.set(extent, mapping);
        return mapping;
    }

    scale.gapMapping = (extent) =>
        gaps.enabled() ? getMapping(extent) : undefined;
    scale.sizeForStep = (step) => {
        const n = ordinal.domain().length;
        return n
            ? step * bandSpace(n, padding.paddingInner, padding.paddingOuter) +
                  (gaps.enabled() ? gaps.width * gaps.positions.length : 0)
            : 0;
    };
    scale.step = () => getMapping().step;
    scale.bandwidth = () => getMapping().bandwidth;
    scale.invertRange = (bounds) => getMapping().invertRange(bounds);
    scale.invert = (value) => scale.invertRange([value, value])?.[0];
    scale.copy = () => {
        const copy = scaleBand()
            .domain(ordinal.domain())
            .range(range)
            .round(round)
            .paddingInner(padding.paddingInner)
            .paddingOuter(padding.paddingOuter)
            .align(padding.align)
            .gapPositions(gaps.positions)
            .gapWidth(gaps.width)
            .axisLength(gaps.axisLength);
        copy.type = scale.type;
        if (scale.props) copy.props = scale.props;
        return copy;
    };
    return scale;
}

/** @param {import("./scaleBand.js").CategoricalGapScale} scale */
function pointish(scale) {
    const copy = scale.copy;
    scale.padding = scale.paddingOuter;
    delete scale.paddingInner;
    scale.copy = () => pointish(copy());
    return scale;
}

/** @returns {import("./scaleBand.js").CategoricalGapScale} */
export function scalePoint() {
    return pointish(scaleBand().paddingInner(1));
}
