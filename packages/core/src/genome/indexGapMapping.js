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

/** Install the shared gap properties; scale geometry stays with each scale kind.
 * @param {{props?: import("../spec/scale.js").Scale}} scale
 * @param {() => void} invalidate
 */
export function installGroupingGapProperties(scale, invalidate) {
    const state = {
        positions: /** @type {readonly number[]} */ ([]),
        width: 0,
        axisLength: () => 1,
    };
    Object.assign(scale, {
        /** @param {readonly number[] | null} positions */
        gapPositions(positions) {
            if (!arguments.length) return state.positions;
            state.positions = normalizeGapPositions(positions);
            invalidate();
            return scale;
        },
        /** @param {number | null} width */
        gapWidth(width) {
            if (!arguments.length) return state.width;
            if (width != null && (!Number.isFinite(width) || width < 0))
                throw new Error(
                    "Gap width must be a finite nonnegative number."
                );
            state.width = width ?? 0;
            invalidate();
            return scale;
        },
        /** @param {number | (() => number)} value */
        axisLength(value) {
            if (!arguments.length) return state.axisLength();
            state.axisLength =
                typeof value === "function" ? value : () => value;
            invalidate();
            return scale;
        },
    });
    return Object.assign(state, {
        enabled: () =>
            scale.props
                ? hasGroupingGaps(scale.props)
                : state.width > 0 && state.positions.length > 0,
    });
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
