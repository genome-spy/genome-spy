
@import ./fp64-arithmetic;

/**
 * When to switch to fp64
 * Note: this hack works with integer genomic coordinates but likely breaks with everything else
 */
const float precisionThreshold = 1.0 / (1024.0 * 1024.0 * 8.0);


uniform highp vec2 uXScale;
uniform highp vec2 uXTranslate;

/**
 * Post-transformation translation of the vertex on the X axis
 */
uniform float uXOffset;

/**
 * Does viewport transformation and returns the X coordinate on a normalized [0, 1] scale
 */

float normalizeX(vec2 x) {
    // https://stackoverflow.com/a/47543127
    const float FLT_MAX =  3.402823466e+38;

    float normalizedX;

    if (x.x <= -FLT_MAX) {
        // Clamp almost negative infinite to zero (the left edge of the viewport)
        normalizedX = 0.0;

    } else if (x.x >= FLT_MAX) {
        // Clamp almost positive infinite to zero (the right edge of the viewport)
        normalizedX = 1.0;

    } else if (uXScale.x > precisionThreshold) {
        // Use emulated 64bit floating points
        normalizedX = sum_fp64(mul_fp64(x, uXScale), uXTranslate).x;

    } else {
        // 32bit floats provide enough precision are enough
        normalizedX = x.x * uXScale.x + uXTranslate.x;
    }

    return normalizedX + uXOffset / uViewportSize.x;
}
