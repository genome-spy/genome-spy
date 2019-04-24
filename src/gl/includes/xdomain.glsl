
@import ./fp64-arithmetic;

const float precisionThreshold = 1024.0 * 1024.0 * 8.0;

attribute highp vec2 x;

uniform highp vec2 uDomainBegin;
uniform highp vec2 uDomainWidth;

/**
 * Does viewport transformation and returns the X coordinate on normalized [0, 1] scale
 */
float normalizeX() {
    float normalizedX;

    if (uDomainWidth.x < precisionThreshold) {
        vec2 translated = sub_fp64(x, uDomainBegin);
        // Normalize to [0, 1]
        normalizedX = div_fp64(translated, uDomainWidth).x;

    } else {
        normalizedX = (x.x - uDomainBegin.x) / uDomainWidth.x;
    }

    return normalizedX;
}