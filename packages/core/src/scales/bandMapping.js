import { gapRank } from "../genome/indexGapMapping.js";

/**
 * A placement-local mapping. Gap width is expressed in the same units as range.
 * Fractional ranks at the domain edges retain partially visible gaps during
 * navigation; they never change the data coordinates returned by invert().
 * @param {object} options
 * @param {readonly number[]} options.domain
 * @param {readonly number[]} options.range
 * @param {readonly number[]} options.cuts
 * @param {number} options.width
 * @param {readonly number[] | undefined} options.ranks
 * @param {number} options.paddingInner
 * @param {number} options.paddingOuter
 * @param {number} options.align
 * @param {number} [options.minimumSpan] Minimum denominator; categorical fitting may use zero.
 * @param {boolean} [options.round]
 */
export function createBandMapping({
    domain,
    range,
    cuts,
    width,
    ranks,
    paddingInner,
    paddingOuter,
    align,
    minimumSpan = 1,
    round = false,
}) {
    const span = domain[1] - domain[0];
    const rangeSpan = range[1] - range[0];
    const direction = Math.sign(rangeSpan);
    const firstRank = ranks?.[0] ?? gapRank(cuts, domain[0]);
    const lastRank = ranks?.[1] ?? gapRank(cuts, domain[1], true);
    const fits =
        width === 0 || Math.abs(rangeSpan) > width * (lastRank - firstRank);
    // Keep inversion and navigation usable while exhausted placements are hidden.
    const gapWidth = fits ? width : 0;
    const gap = gapWidth * direction;
    const dataRange = rangeSpan - gap * (lastRank - firstRank);
    let step =
        dataRange /
        (Math.max(
            ranks ? Number.EPSILON : minimumSpan,
            span - paddingInner + 2 * paddingOuter
        ) || 1);
    if (round) step = direction * Math.floor(Math.abs(step));
    let start = range[0] + (dataRange - step * (span - paddingInner)) * align;
    let bandwidth = Math.abs(step) * (1 - paddingInner);
    if (round) {
        start = Math.round(start);
        bandwidth = Math.round(bandwidth);
    }

    /** @param {number} value @param {number} [band] @param {boolean} [before] */
    function position(value, band = 0, before = false) {
        if (!fits) return NaN;
        const index = Math.floor(value);
        return (
            start +
            (index - domain[0]) * step +
            gap * (gapRank(cuts, index, before) - firstRank) +
            direction * bandwidth * band
        );
    }

    /**
     * @param {number} pixel
     * @param {number} [slope]
     * @param {number} [origin]
     */
    function invertPoint(pixel, slope = step, origin = start) {
        const distance = (pixel - origin) * direction;
        const dataStep = slope * direction;
        if (dataStep === 0) return { value: domain[0], rank: firstRank };
        let lo = 0;
        let hi = cuts.length;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            const after =
                (cuts[mid] - domain[0]) * dataStep +
                gapWidth * (mid + 1 - firstRank);
            if (after < distance) lo = mid + 1;
            else hi = mid;
        }
        if (lo < cuts.length && gapWidth > 0) {
            const before =
                (cuts[lo] - domain[0]) * dataStep + gapWidth * (lo - firstRank);
            if (distance >= before) {
                return {
                    value: cuts[lo],
                    rank: lo + (distance - before) / gapWidth,
                };
            }
        }
        return {
            value:
                domain[0] + (distance - gapWidth * (lo - firstRank)) / dataStep,
            rank: lo,
        };
    }

    /**
     * Retain fractional progress through gaps at viewport edges. Only the data
     * slope changes with zoom; translating the origin leaves gap widths fixed.
     * @param {number} factor
     * @param {number} anchor
     * @param {number} pan
     */
    function navigate(factor, anchor, pan) {
        if (!width || !cuts.length) {
            // Keep ordinary index navigation's span semantics while padding
            // remains fixed in rank units. Gapped navigation changes data slope.
            const newSpan = Math.max(1, span * factor);
            const pad = 2 * paddingOuter - paddingInner;
            const oldStepSpan = Math.max(minimumSpan, span + pad) || 1;
            const newStepSpan = Math.max(minimumSpan, newSpan + pad) || 1;
            const fraction = (anchor - range[0]) / rangeSpan;
            const first =
                domain[0] +
                (fraction - align) * (oldStepSpan - newStepSpan) +
                align * (span - newSpan) -
                pan * newSpan;
            return { domain: [first, first + newSpan], ranks: undefined };
        }
        const point = invertPoint(anchor);
        const limit =
            Math.abs(rangeSpan) /
            (Math.max(minimumSpan, 1 - paddingInner + 2 * paddingOuter) || 1);
        const slope = direction * Math.min(limit, Math.abs(step) / factor);
        const origin =
            anchor -
            slope * (point.value - domain[0]) -
            gap * (point.rank - firstRank) +
            pan * rangeSpan;
        return domainAt(slope, origin);
    }

    /** @param {number} slope @param {number} origin */
    function domainAt(slope, origin) {
        const first = invertPoint(
            range[0] + slope * 2 * paddingOuter * align,
            slope,
            origin
        );
        const last = invertPoint(
            range[1] + slope * (paddingInner - 2 * paddingOuter * (1 - align)),
            slope,
            origin
        );
        return {
            domain: [first.value, last.value],
            ranks: [first.rank, last.rank],
        };
    }

    /** Interpolate the camera rather than refitting integer cut counts per frame.
     * @param {{step: number, start: number, firstRank: number, domainStart: number}} target
     * @param {number} t
     */
    function interpolate(target, t) {
        const logRatio = Math.log(target.step / step);
        const slope = step * Math.exp(t * logRatio);
        const weight =
            logRatio === 0
                ? t
                : Math.expm1(t * logRatio) / Math.expm1(logRatio);
        const targetOrigin =
            target.start +
            (domain[0] - target.domainStart) * target.step +
            gap * (firstRank - target.firstRank);
        return domainAt(slope, start + weight * (targetOrigin - start));
    }

    return {
        fits,
        position,
        invertPoint,
        navigate,
        interpolate,
        domainStart: domain[0],
        step,
        bandwidth,
        start,
        firstRank,
        lastRank,
        gap,
    };
}
