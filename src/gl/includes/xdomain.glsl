
@import ./fp64-arithmetic;

/**
 * When to switch to fp64
 * Note: this hack works with integer genomic coordinates but likely breaks with everything else
 */
const float precisionThreshold = 1024.0 * 1024.0 * 8.0;

/**
 * X coordinate of the vertex as fp64 (emulated 64bit floating point)
 */
attribute highp vec2 x;

uniform highp vec2 uXDomainBegin;
uniform highp vec2 uXDomainWidth;

/**
 * Post-transformation translation of the vertex on the X axis
 */
uniform float uXOffset;

/**
 * Does viewport transformation and returns the X coordinate on a normalized [0, 1] scale
 */

float normalizeX() {
    // https://stackoverflow.com/a/47543127
    const float FLT_MAX =  3.402823466e+38;

    float normalizedX;

    if (x.x <= -FLT_MAX) {
        // Clamp almost negative infinite to zero (the left edge of the viewport)
        normalizedX = 0.0;

    } else if (x.x >= FLT_MAX) {
        // Clamp almost positive infinite to zero (the right edge of the viewport)
        normalizedX = 1.0;

    } else if (uXDomainWidth.x < precisionThreshold) {
        // Use emulated 64bit floating points
        vec2 translated = sub_fp64(x, uXDomainBegin);
        // Normalize to [0, 1]
        normalizedX = div_fp64(translated, uXDomainWidth).x;

    } else {
        // 32bit floats provide enough precision are enough
        normalizedX = (x.x - uXDomainBegin.x) / uXDomainWidth.x;
    }

    return normalizedX + uXOffset;
}