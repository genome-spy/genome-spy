#if defined(ROUNDED_CORNERS) || defined(STROKED)
in vec2 vPosInPixels;
#endif

in vec2 vHalfSizeInPixels;

in lowp vec4 vFillColor;
in lowp vec4 vStrokeColor;
in float vHalfStrokeWidth;
in vec4 vCornerRadii;

out lowp vec4 fragColor;

// Source: https://www.iquilezles.org/www/articles/distfunctions2d/distfunctions2d.htm
float sdRoundedBox(vec2 p, vec2 b, vec4 r) {
    r.xy = p.x > 0.0 ? r.xy : r.zw;
    r.x  = p.y > 0.0 ? r.x  : r.y;
    vec2 q = abs(p) - b + r.x;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r.x;
}

// Not a true SDF. Makes the corners of strokes sharp and is faster.
float sdSharpBox(vec2 p, vec2 b) {
    vec2 q = abs(p) - b;
    return max(q.x, q.y);
}

void main(void) {

#if defined(ROUNDED_CORNERS) || defined(STROKED)
#ifdef ROUNDED_CORNERS
    // Distance from rectangle's edge in pixels. Negative inside the rectangle.
    float d = sdRoundedBox(vPosInPixels, vHalfSizeInPixels, vCornerRadii);
#else
    float d = sdSharpBox(vPosInPixels, vHalfSizeInPixels);
#endif

    fragColor = distanceToColor(d, vFillColor, vStrokeColor, vHalfStrokeWidth);

    if (fragColor.a == 0.0) {
        discard;
    }
#else
    // The trivial, non-decorated case
    fragColor = vFillColor;
#endif

    if (uPickingEnabled) {
        fragColor = vPickingColor;
    }
}
