/** @param {import("../../index.d.ts").ChannelScale | undefined} scale */
export function hasIndexGaps(scale) {
    return (
        scale?.type === "index" &&
        (scale.gapEnabled ??
            (scale.gapWidth !== 0 &&
                scale.gapWidth !== null &&
                (scale.gapPositions?.length ?? 0) > 0))
    );
}

/** @param {readonly number[]} cuts @param {number} value @param {boolean} [before] */
export function cutRank(cuts, value, before = false) {
    let lo = 0;
    let hi = cuts.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (cuts[mid] < value || (!before && cuts[mid] === value)) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

/** @param {readonly number[] | null} values */
export function normalizeCuts(values) {
    const cuts = Array.from(new Set(values ?? [])).sort((a, b) => a - b);
    if (cuts.some((v) => !Number.isSafeInteger(v) || v < 0 || v >= 2 ** 44))
        throw new Error("Gap positions must be integers in [0, 2^44).");
    return cuts;
}

// Only included when a channel opts into grouping gaps.
export const INDEX_GAPS_WGSL = /* wgsl */ `
fn gapKeyGreater(a: vec2<u32>, b: vec2<u32>) -> bool {
    return a.x > b.x || (a.x == b.x && a.y > b.y);
}

fn cutRank(value: vec2<u32>, table: vec2<u32>, before: bool) -> u32 {
    var lo = 0u;
    var hi = table.y;
    while (lo < hi) {
        let mid = (lo + hi) / 2u;
        let cut = gapCuts[table.x + mid];
        let less = cut.x < value.x || (cut.x == value.x && cut.y < value.y);
        if (less || (!before && all(cut == value))) { lo = mid + 1u; }
        else { hi = mid; }
    }
    return lo;
}

fn gapPlacementFactor(i: u32, axis: u32) -> f32 {
#if defined(PLACEMENT_ENABLED)
    let placement = getPlacementIndex(i);
    return placementRectangles[placement][axis + 2u];
#else
    return 1.0;
#endif
}

fn indexGapsFit(range: vec2<f32>, geometry: vec4<f32>, placement: f32) -> bool {
    return abs(range.y - range.x) * placement > geometry.x * (geometry.z - geometry.y);
}

fn scaleIndexGaps(value: vec2<u32>, domain: vec3<f32>, range: vec2<f32>,
    table: vec2<u32>, geometry: vec4<f32>, paddingInner: f32,
    paddingOuter: f32, align: f32, band: f32, before: bool, placement: f32) -> f32 {
    let gap = geometry.x * sign(range.y - range.x) / max(placement, 1e-9);
    let available = range.y - range.x - gap * (geometry.z - geometry.y);
    let denominator = max(select(1.0, 1e-9, geometry.w > 0.5), domain.z - paddingInner + 2.0 * paddingOuter);
    let step = available / denominator;
    let start = range.x + (available - step * (domain.z - paddingInner)) * align;
    let hi = stableSub(f32(value.x) * 4096.0, domain.x);
    let lo = stableSub(f32(value.y), domain.y);
    let rank = f32(cutRank(value, table, before));
    return start + hi * step + lo * step + gap * (rank - geometry.y) + step * (1.0 - paddingInner) * band;
}
`;
