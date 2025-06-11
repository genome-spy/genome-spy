#if defined(ROUNDED_CORNERS) || defined(STROKED) || defined(SHADOW)
in vec2 vPosInPixels;
#endif

in vec2 vHalfSizeInPixels;

in lowp vec4 vFillColor;
in lowp vec4 vStrokeColor;
in float vHalfStrokeWidth;
in vec4 vCornerRadii;

out lowp vec4 fragColor;

// ----------------------------------------------------------------------------
// Shadow source: https://madebyevan.com/shaders/fast-rounded-rectangle-shadows/
// License: CC0 (http://creativecommons.org/publicdomain/zero/1.0/)

#ifdef SHADOW

// A standard gaussian function, used for weighting samples
float gaussian(float x, float sigma) {
  const float pi = 3.141592653589793;
  return exp(-(x * x) / (2.0 * sigma * sigma)) / (sqrt(2.0 * pi) * sigma);
}

// This approximates the error function, needed for the gaussian integral
vec2 erf(vec2 x) {
  vec2 s = sign(x), a = abs(x);
  x = 1.0 + (0.278393 + (0.230389 + 0.078108 * (a * a)) * a) * a;
  x *= x;
  return s - s / (x * x);
}

// Return the blurred mask along the x dimension
float roundedBoxShadowX(float x, float y, float sigma, float corner, vec2 halfSize) {
  float delta = min(halfSize.y - corner - abs(y), 0.0);
  float curved = halfSize.x - corner + sqrt(max(0.0, corner * corner - delta * delta));
  vec2 integral = 0.5 + 0.5 * erf((x + vec2(-curved, curved)) * (sqrt(0.5) / sigma));
  return integral.y - integral.x;
}

// Return the mask for the shadow of a box from lower to upper
float roundedBoxShadow(vec2 lower, vec2 upper, vec2 point, float sigma, float corner) {
  // Center everything to make the math easier
  vec2 center = (lower + upper) * 0.5;
  vec2 halfSize = (upper - lower) * 0.5;
  point -= center;

  // The signal is only non-zero in a limited range, so don't waste samples
  float low = point.y - halfSize.y;
  float high = point.y + halfSize.y;
  float start = clamp(-3.0 * sigma, low, high);
  float end = clamp(3.0 * sigma, low, high);

  // Accumulate samples (we can get away with surprisingly few samples)
  float step = (end - start) / 4.0;
  float y = start + step * 0.5;
  float value = 0.0;
  for (int i = 0; i < 4; i++) {
    value += roundedBoxShadowX(point.x, point.y - y, sigma, corner, halfSize) * gaussian(y, sigma) * step;
    y += step;
  }

  return value;
}

// ----------------------------------------------------------------------------

#endif

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

#if defined(ROUNDED_CORNERS) || defined(STROKED) || defined(SHADOW)
#ifdef ROUNDED_CORNERS
    // Distance from rectangle's edge in pixels. Negative inside the rectangle.
    float d = sdRoundedBox(vPosInPixels, vHalfSizeInPixels, vCornerRadii);
#else
    float d = sdSharpBox(vPosInPixels, vHalfSizeInPixels);
#endif

    vec4 backgroundColor = vec4(0.0, 0.0, 0.0, 0.0);

#ifdef SHADOW
    float maxCornerRadius = max(vCornerRadii.x, max(vCornerRadii.y, max(vCornerRadii.z, vCornerRadii.w)));

    float shadow = 0.0;
    // Only calculate shadow for the region outside the stroke.
    if (d >= vHalfStrokeWidth - 1.0 && uShadowOpacity > 0.0) {
        shadow = roundedBoxShadow(
            -vHalfSizeInPixels - vHalfStrokeWidth,
            vHalfSizeInPixels + vHalfStrokeWidth,
            vPosInPixels - vec2(uShadowOffsetX, -uShadowOffsetY),
            max(uShadowBlur / 2.5, 0.25),
            maxCornerRadius + vHalfStrokeWidth
        ) * uShadowOpacity * max(vStrokeColor.a, vFillColor.a);
    }
    backgroundColor = vec4(uShadowColor * shadow, shadow);
#endif

    if (vHalfStrokeWidth > 0.0 && uHatchPattern > 0) {
        d = max(d, -pattern());
    }

    fragColor = distanceToColor(
        d,
        vFillColor,
        vStrokeColor,
        backgroundColor,
        vHalfStrokeWidth
    );

    if (uPickingEnabled) {
        if (d < vHalfStrokeWidth) {
            fragColor = vPickingColor;
        }
    } else if (fragColor.a == 0.0) {
        discard;
    }
#else
    // The trivial, non-decorated case
    fragColor = vFillColor;
    if (uPickingEnabled) {
        fragColor = vPickingColor;
    }
#endif
}
