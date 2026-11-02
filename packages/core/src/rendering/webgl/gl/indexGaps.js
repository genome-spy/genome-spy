/** Generate helpers only for structurally enabled scales.
 * @param {string} name
 * @param {boolean} [categorical]
 */
export function groupingGapGlsl(name, categorical = false) {
    const axis =
        name === "y"
            ? "uViewportSize.y * getSampleFacetPos().height"
            : "uViewportSize.x";
    const shared = `
uniform highp usampler2D uGapCuts_${name};
uniform highp int uGapCount_${name};
uniform highp vec4 uGapGeometry_${name};

bool gapFits_${name}(vec2 range) {
    return abs(range.y - range.x) * ${axis} >
        uGapGeometry_${name}.x * (uGapGeometry_${name}.z - uGapGeometry_${name}.y);
}

int gapRank_${name}(uvec2 value, bool before) {
    int lo = 0;
    int hi = uGapCount_${name};
    int width = textureSize(uGapCuts_${name}, 0).x;
    while (lo < hi) {
        int mid = (lo + hi) / 2;
        uvec2 cut = texelFetch(uGapCuts_${name}, ivec2(mid % width, mid / width), 0).rg;
        bool less = cut.x < value.x || (cut.x == value.x && cut.y < value.y);
        if (less || (!before && all(equal(cut, value)))) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}
`;

    if (categorical)
        return (
            shared +
            `
float scaleBandGaps_${name}(uint value, vec2 domain, vec2 range,
    float paddingInner, float paddingOuter, float align, float band) {
    float gap = uGapGeometry_${name}.x / ${axis};
    float count = uGapGeometry_${name}.z;
    float available = abs(range.y - range.x) - gap * count;
    float n = domain.y - domain.x;
    float space = n - paddingInner + 2.0 * paddingOuter;
    float step = available / (space > 0.0 ? space : 1.0);
    float start = min(range.x, range.y) + (available - step * (n - paddingInner)) * align;
    float rank = float(gapRank_${name}(uvec2(value >> 12u, value & 4095u), false));
    float offset = float(value) - domain.x;
    if (range.y < range.x) {
        offset = n - 1.0 - offset;
        rank = count - rank;
    }
    return start + offset * step + gap * rank + step * (1.0 - paddingInner) * band;
}
`
        );

    return (
        shared +
        `
float scaleGaps_${name}(uvec2 value, vec3 domain, vec2 range,
    float paddingInner, float paddingOuter, float align, float band, bool before) {
    vec4 geometry = uGapGeometry_${name};
    float gap = geometry.x / ${axis} * sign(range.y - range.x);
    float available = range.y - range.x - gap * (geometry.z - geometry.y);
    float step = available / max(geometry.w > 0.5 ? 1e-9 : 1.0, domain.z - paddingInner + 2.0 * paddingOuter);
    float start = range.x + (available - step * (domain.z - paddingInner)) * align;
    float inf = 1.0 / uZero;
    float hi = max(float(value.x) * 4096.0 - domain.x, -inf);
    float lo = max(float(value.y) - domain.y, -inf);
    float rank = float(gapRank_${name}(value, before));
    return start + hi * step + lo * step + gap * (rank - geometry.y) + step * (1.0 - paddingInner) * band;
}

float scaleGaps_${name}(uint value, vec3 domain, vec2 range,
    float paddingInner, float paddingOuter, float align, float band, bool before) {
    return scaleGaps_${name}(uvec2(value >> 12u, value & 4095u), domain, range,
        paddingInner, paddingOuter, align, band, before);
}
`
    );
}
