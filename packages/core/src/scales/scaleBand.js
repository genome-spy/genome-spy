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

import { bandSpace } from "vega-scale";
import clamp from "../utils/clamp.js";
import { installGroupingGapProperties } from "../genome/indexGapMapping.js";
import { createBandMapping } from "./bandMapping.js";

/**
 * Category identity wraps the same numeric geometry used by index scales.
 * Rank lookup changes only with membership/order, never during navigation.
 * @returns {import("./scaleBand.js").CategoricalGapScale}
 */
export default function scaleBand() {
    /** @type {import("../spec/channel.js").Scalar[]} */
    let domain = [];
    /** @type {Map<import("../spec/channel.js").Scalar, number>} */
    let ranks = new Map();
    let range = [0, 1];
    let round = false;
    /** @type {import("./scaleBand.js").CategoricalViewport | null} */
    let viewport = null;
    const padding = { paddingInner: 0, paddingOuter: 0, align: 0.5 };

    /** @type {Map<number, ReturnType<typeof createMapping>>} */
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
        if (!arguments.length) return domain.slice();
        ranks = new Map();
        for (const value of values) {
            if (!ranks.has(value)) ranks.set(value, ranks.size);
        }
        domain = Array.from(ranks.keys());
        return invalidate();
    };
    // @ts-expect-error Getter/setter overloads.
    scale.viewport = function (value) {
        if (!arguments.length) return copyViewport(viewport);
        if (value !== null && round)
            throw new Error(
                "Categorical scale viewports do not support round: true."
            );
        viewport = copyViewport(value);
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
        if (value && viewport)
            throw new Error(
                "Categorical scale viewports do not support round: true."
            );
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

    /** @param {number} [extent] */
    function getMapping(extent) {
        // Disabled gaps must not read layout; ordinary mappings have one entry.
        const enabled = gaps.enabled();
        const length = enabled ? (extent ?? gaps.axisLength()) : 0;
        let mapping = mappings.get(length);
        if (!mapping) {
            mapping = createMapping(length, enabled);
            mappings.set(length, mapping);
        }
        return mapping;
    }

    /** @param {number} extent @param {boolean} enabled */
    function createMapping(extent, enabled) {
        const categories = domain;
        const lookup = ranks;
        const n = categories.length;
        const reverse = range[1] < range[0];
        const numeric = createBandMapping({
            domain: viewport?.interval ?? [0, n],
            range,
            cuts: enabled ? gaps.positions : [],
            width: extent > 0 ? gaps.width / extent : 0,
            ranks: viewport?.gapRanks,
            ...padding,
            // Numeric geometry starts at the rank-leading edge; band starts
            // stay at the physical low edge, including noncentral alignment.
            align: reverse ? 1 - padding.align : padding.align,
            minimumSpan: 0,
            round,
        });
        const fits = !enabled || (extent > 0 && numeric.fits);
        const bandwidth = fits ? numeric.bandwidth : 0;
        /** @param {number} rank @param {number} [band] */
        const positionAt = (rank, band = 0) =>
            fits ? numeric.position(rank, reverse ? 1 - band : band) : NaN;
        /** @param {import("../spec/channel.js").Scalar} value @param {number} [band] */
        const position = (value, band = 0) => {
            const rank = lookup.get(value);
            return rank === undefined ? undefined : positionAt(rank, band);
        };
        /** Find the last physical band start at/below a range coordinate.
         * @param {number} value
         */
        const rankAt = (value) => {
            let lo = 0;
            let hi = n;
            while (lo < hi) {
                const mid = (lo + hi) >>> 1;
                if (positionAt(reverse ? n - 1 - mid : mid) <= value)
                    lo = mid + 1;
                else hi = mid;
            }
            return lo - 1;
        };
        /** @param {readonly number[]} bounds */
        const invertRange = (bounds) => {
            if (!fits || bounds[0] == null || bounds[1] == null) return;
            if (!n) return enabled ? undefined : [];
            const lo = Math.min(bounds[0], bounds[1]);
            const hi = Math.max(bounds[0], bounds[1]);
            if (Number.isNaN(lo) || Number.isNaN(hi)) return;
            let a = Math.max(0, rankAt(lo));
            const start = positionAt(reverse ? n - 1 - a : a);
            if (lo - start > bandwidth + 1e-10) ++a;
            let b = Math.min(n - 1, rankAt(hi));
            if (reverse) [a, b] = [n - 1 - b, n - 1 - a];
            return a > b ? undefined : categories.slice(a, b + 1);
        };
        return {
            position,
            invertRange,
            fits,
            step: fits ? Math.abs(numeric.step) : 0,
            bandwidth,
            numeric,
        };
    }

    scale.navigationMapping = (extent) => getMapping(extent).numeric;
    scale.gapMapping = (extent) =>
        gaps.enabled() ? getMapping(extent) : undefined;
    scale.sizeForStep = (step) =>
        domain.length
            ? step *
                  bandSpace(
                      domain.length,
                      padding.paddingInner,
                      padding.paddingOuter
                  ) +
              (gaps.enabled() ? gaps.width * gaps.positions.length : 0)
            : 0;
    scale.step = () => getMapping().step;
    scale.bandwidth = () => getMapping().bandwidth;
    scale.invertRange = (bounds) => getMapping().invertRange(bounds);
    scale.invert = (value) => scale.invertRange([value, value])?.[0];
    scale.copy = () => {
        const copy = scaleBand()
            .domain(domain)
            .range(range)
            .round(round)
            .viewport(viewport)
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

/** Validate and detach one complete navigation snapshot.
 * @param {import("./scaleBand.js").CategoricalViewport | null} value
 * @returns {import("./scaleBand.js").CategoricalViewport | null}
 */
export function copyViewport(value) {
    if (value === null) return null;
    const { interval, gapRanks } = value;
    if (
        !Array.isArray(interval) ||
        interval.length !== 2 ||
        !interval.every(Number.isFinite) ||
        interval[1] < interval[0] ||
        (!gapRanks && interval[0] === interval[1]) ||
        (gapRanks &&
            (gapRanks.length !== 2 ||
                !gapRanks.every(Number.isFinite) ||
                gapRanks[1] < gapRanks[0]))
    ) {
        throw new Error(
            "A categorical viewport requires an increasing finite rank interval and optional finite gap ranks."
        );
    }
    return {
        interval: [interval[0], interval[1]],
        ...(gapRanks
            ? {
                  gapRanks: /** @type {[number, number]} */ ([
                      gapRanks[0],
                      gapRanks[1],
                  ]),
              }
            : {}),
    };
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
