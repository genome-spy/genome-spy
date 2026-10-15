layout(std140) uniform Mark {
    uniform float uArcHeightFactor;

    /** Make very small arcs visible */
    uniform float uMinArcHeight;

    /** The minimum stroke width in pixels when rendering into the picking buffer */
    uniform float uMinPickingSize;

    uniform int uShape;
    uniform int uOrient;
    uniform bool uClampApex;

    // In pixels
    uniform float uMaxChordLength;
    // In pixels
    uniform vec2 uArcFadingDistance;
    uniform bool uNoFadingOnSecondPass;

    uniform int uSegmentBreaks;

#pragma markUniforms
};

const int SHAPE_ORTHOGONAL = 4;

// Butt rectangles, the outer miter quadrant, and an interior rectangle for
// continuous antialiasing across their shared boundaries. The interior is
// already covered by the first three and needs no separate draw geometry.
vec4 orthogonalBounds(int part, vec2 a, vec2 b, float h) {
    vec2 c = uOrient == 1 ? vec2(a.x, b.y) : vec2(b.x, a.y);
    vec2 first = c - a;
    vec2 second = b - c;
    bool hasFirst = any(notEqual(first, vec2(0.0)));
    bool hasSecond = any(notEqual(second, vec2(0.0)));
    if (part < 2) {
        vec2 start = part == 0 ? a : c;
        vec2 end = part == 0 ? c : b;
        if (all(equal(start, end))) return vec4(c, c);
        vec2 pad = vec2(start.x == end.x ? h : 0.0, start.y == end.y ? h : 0.0);
        return vec4(min(start, end) - pad, max(start, end) + pad);
    }
    if (!hasFirst || !hasSecond) return vec4(c, c);
    vec2 t1 = sign(first);
    vec2 t2 = sign(second);
    if (part == 2) {
        vec2 outer = c + (t1 - t2) * h;
        return vec4(min(c, outer), max(c, outer));
    }
    float l1 = abs(first.x) + abs(first.y);
    float l2 = abs(second.x) + abs(second.y);
    vec2 low = c - t1 * min(l1, h) - t2 * h;
    vec2 high = c + t1 * h + t2 * min(l2, h);
    return vec4(min(low, high), max(low, high));
}

float orthogonalDistance(vec2 p, vec4 bounds) {
    if (any(lessThanEqual(bounds.zw, bounds.xy))) return 1e20;
    vec2 distance = max(bounds.xy - p, p - bounds.zw);
    return max(distance.x, distance.y);
}
