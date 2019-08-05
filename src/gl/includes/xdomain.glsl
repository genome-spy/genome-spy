
@import ./fp64-arithmetic;

// https://stackoverflow.com/a/47543127
const float FLT_MAX = 3.402823466e+38;
const float FLT_MIN = 1.175494351e-38;

// When to switch to fp64
const float precisionThreshold = 1024.0 * 1024.0 * 8.0;

attribute highp vec2 x;

uniform highp vec2 uXDomainBegin;
uniform highp vec2 uXDomainWidth;

uniform float uXOffset;

/**
 * Does viewport transformation and returns the X coordinate on a normalized [0, 1] scale
 */
float normalizeX() {
    float normalizedX;

    if (x.x <= FLT_MIN) {
        normalizedX = 0.0;

    } else if (x.x >= FLT_MAX) {
        normalizedX = 1.0;

    } else if (uXDomainWidth.x < precisionThreshold) {
        vec2 translated = sub_fp64(x, uXDomainBegin);
        // Normalize to [0, 1]
        normalizedX = div_fp64(translated, uXDomainWidth).x;

    } else {
        normalizedX = (x.x - uXDomainBegin.x) / uXDomainWidth.x;
    }

    return normalizedX + uXOffset;
}