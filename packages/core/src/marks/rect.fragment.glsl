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

float diagonalPattern(vec2 uv, float spacing) {
    // Using 1.5 to approximate sqrt(2.0) to reduce aliasing artifacts.
    float divisor = spacing * vHalfStrokeWidth * 2.0 * 1.5;
    return abs(mod(uv.x - uv.y, divisor) - 0.5 * divisor) / 1.5;
}

float verticalPattern(float x, float spacing) {
    float divisor = spacing * vHalfStrokeWidth * 2.0;
    return abs(mod(x, divisor)) / 2.0;
}

float circle(vec2 p, float r) {
    return length(p) - r;
}

float masonryCirclePattern(vec2 uv, float spacing, float radius) {
    float halfSpacing = 0.5 * spacing;

    float row = floor(uv.y / spacing);
    float shift = mod(row, 2.0) * halfSpacing;

    vec2 shifted = vec2(uv.x + shift, uv.y + halfSpacing);
    vec2 cell = mod(shifted + 0.5 * spacing, spacing) - halfSpacing;

    return abs(circle(cell, radius));
}

/**
 * Patterns:
 * 0  none
 * 1  diagonal (/)
 * 2  antiDiagonal (\)
 * 3  cross (X)
 * 4  vertical (|)
 * 5  horizontal (-)
 * 6  grid (+)
 * 7  dots (.)
 * 8  rings (o)
 * 9  ringsLarge (O)
 */
float pattern() {
#ifdef STROKED
    int patternType = uHatchPattern;
    vec2 uv = vPosInPixels;
    float spacing = 4.0;

    switch (patternType) {
        case 1:
            return diagonalPattern(vec2(uv.x, -uv.y), spacing);
        case 2:
            return diagonalPattern(uv, spacing);
        case 3:
            return min(
                diagonalPattern(uv, spacing),
                diagonalPattern(vec2(uv.x, -uv.y), spacing)
            );
        case 4:
            return verticalPattern(uv.x, spacing);
        case 5:
            return verticalPattern(uv.y, spacing);
        case 6:
            return min(
                verticalPattern(uv.x, spacing),
                verticalPattern(uv.y, spacing)
            );
        case 7:
        case 8:
        case 9: {
            float spacing = vHalfStrokeWidth * 14.0;
            float radius = spacing * (
                patternType == 8 ? 0.2 :
                patternType == 9 ? 0.35 :
                0.07
            );
            return masonryCirclePattern(uv, spacing, radius);
        }
        default:
            break;
    }
#endif
    return 1.0 / 0.0; // Infinity
}

void main(void) {

#if defined(ROUNDED_CORNERS) || defined(STROKED)
#ifdef ROUNDED_CORNERS
    // Distance from rectangle's edge in pixels. Negative inside the rectangle.
    float d = sdRoundedBox(vPosInPixels, vHalfSizeInPixels, vCornerRadii);
#else
    float d = sdSharpBox(vPosInPixels, vHalfSizeInPixels);
#endif

    if (vHalfStrokeWidth > 0.0 && uHatchPattern > 0) {
        d = max(d, -pattern());
    }

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
