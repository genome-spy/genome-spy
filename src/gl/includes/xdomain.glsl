
@import ./fp64-arithmetic;

const float precisionThreshold = 1024.0 * 1024.0 * 8.0;

attribute highp vec2 x;

uniform highp vec2 uXDomainBegin;
uniform highp vec2 uXDomainWidth;

/**
 * Does viewport transformation and returns the X coordinate on normalized [0, 1] scale
 */
float normalizeX() {
    float normalizedX;

    if (uXDomainWidth.x < precisionThreshold) {
        vec2 translated = sub_fp64(x, uXDomainBegin);
        // Normalize to [0, 1]
        normalizedX = div_fp64(translated, uXDomainWidth).x;

    } else {
        normalizedX = (x.x - uXDomainBegin.x) / uXDomainWidth.x;
    }

    return normalizedX;
}