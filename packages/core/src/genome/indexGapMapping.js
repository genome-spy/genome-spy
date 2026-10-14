/**
 * The insertion rank is the number of cuts before a coordinate, optionally
 * including a cut at that coordinate. Keys stay as exact JavaScript integers.
 * @param {readonly number[]} cuts
 * @param {number} value
 * @param {boolean} [before]
 */
export function gapRank(cuts, value, before = false) {
    let lo = 0;
    let hi = cuts.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (cuts[mid] < value || (!before && cuts[mid] === value)) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

// Scale copies and mapping publication can reuse canonical cuts safely.
const normalizedGapPositions = new WeakSet();

/** @param {readonly number[] | null} positions */
export function normalizeGapPositions(positions) {
    if (positions && normalizedGapPositions.has(positions)) return positions;
    const cuts = Array.from(new Set(positions ?? [])).sort((a, b) => a - b);
    if (
        cuts.some(
            (value) =>
                !Number.isSafeInteger(value) || value < 0 || value >= 2 ** 44
        )
    ) {
        throw new Error("Gap positions must be integers in [0, 2^44).");
    }
    normalizedGapPositions.add(cuts);
    return Object.freeze(cuts);
}

/** Static classification; a reactive zero does not remove shader resources.
 * @param {import("../spec/scale.js").Scale} props
 */
export function hasGroupingGaps(props = {}) {
    return (
        props.gapWidth !== 0 &&
        props.gapWidth !== null &&
        props.gapPositions != null &&
        !(Array.isArray(props.gapPositions) && props.gapPositions.length === 0)
    );
}

/** Resolved enablement, independent of shader specialization.
 * @param {{gapWidth: number | null, gapPositions: readonly number[]}} mapping
 */
export function hasEffectiveGroupingGaps(mapping) {
    return mapping.gapWidth > 0 && mapping.gapPositions.length > 0;
}

/** Shader structure changes only when static gap enablement changes.
 * @param {Record<string, import("../types/encoder.js").Encoder>} encoders
 */
export function groupingGapKey(encoders) {
    const enabled = (/** @type {"x" | "y"} */ axis) => {
        const scale = encoders[axis]?.scale;
        return !!scale && hasGroupingGaps(scale.props);
    };
    return Number(enabled("x")) | (Number(enabled("y")) << 1);
}

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
 */
export function createIndexGapMapping({
    domain,
    range,
    cuts,
    width,
    ranks,
    paddingInner,
    paddingOuter,
    align,
}) {
    const span = domain[1] - domain[0];
    const rangeSpan = range[1] - range[0];
    const direction = Math.sign(rangeSpan);
    const firstRank = ranks?.[0] ?? gapRank(cuts, domain[0]);
    const lastRank = ranks?.[1] ?? gapRank(cuts, domain[1], true);
    const fits = Math.abs(rangeSpan) > width * (lastRank - firstRank);
    // Keep inversion and navigation usable while exhausted placements are hidden.
    const gapWidth = fits ? width : 0;
    const gap = gapWidth * direction;
    const dataRange = rangeSpan - gap * (lastRank - firstRank);
    const step =
        dataRange /
        Math.max(
            ranks ? Number.EPSILON : 1,
            span - paddingInner + 2 * paddingOuter
        );
    const start = range[0] + (dataRange - step * (span - paddingInner)) * align;

    /** @param {number} value @param {number} [band] @param {boolean} [before] */
    function position(value, band = 0, before = false) {
        if (!fits) return NaN;
        const index = Math.floor(value);
        return (
            start +
            (index - domain[0]) * step +
            gap * (gapRank(cuts, index, before) - firstRank) +
            step * (1 - paddingInner) * band
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
        const point = invertPoint(anchor);
        const limit =
            Math.abs(rangeSpan) /
            Math.max(1, 1 - paddingInner + 2 * paddingOuter);
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
        start,
        firstRank,
        lastRank,
        gap,
    };
}
