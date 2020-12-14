/** Offset in "unit" units */
uniform vec2 uViewOffset;

uniform vec2 uViewScale;

/** Size of the logical viewport, i.e., the view */
uniform vec2 uViewportSize;

uniform lowp float uDevicePixelRatio;

/**
 * Maps a coordinate on unit scale to normalized device coordinates
 */
vec4 unitToNdc(vec2 coord) {
#if dx_DEFINED || dy_DEFINED
    // TODO: This should be done at an earlier stage for text mark!
    vec2 dOffset = vec2(getScaled_dx(), getScaled_dy()) / uViewportSize;
#else
    vec2 dOffset = vec2(0.0, 0.0);
#endif
    return vec4((coord * uViewScale + uViewOffset + dOffset) * 2.0 - 1.0, 0.0, 1.0);
}

vec4 unitToNdc(float x, float y) {
    return unitToNdc(vec2(x, y));
}

float linearstep(float edge0, float edge1, float x) {
    return clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
}
