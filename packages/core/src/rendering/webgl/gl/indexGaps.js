/** Generate helpers only for structurally enabled scales.
 * @param {string} name
 */
export function indexGapGlsl(name) {
    const axis =
        name === "y"
            ? "uViewportSize.y * getSampleFacetPos().height"
            : "uViewportSize.x";
    return `
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
`;
}
