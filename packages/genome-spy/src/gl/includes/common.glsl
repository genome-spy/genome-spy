#define PI 3.141593

/** Offset in "unit" units */
uniform vec2 uViewOffset;

uniform vec2 uViewScale;

/** Size of the logical viewport in pixels, i.e., the view */
uniform vec2 uViewportSize;

uniform lowp float uDevicePixelRatio;

// TODO: Views with opacity less than 1.0 should be rendered into a texture
// that is rendered with the specified opacity.
uniform lowp float uViewOpacity;

/**
 * Maps a coordinate on the unit scale to a normalized device coordinate.
 * (0, 0) is at the bottom left corner.
 */
vec4 unitToNdc(vec2 coord) {
    return vec4((coord * uViewScale + uViewOffset) * 2.0 - 1.0, 0.0, 1.0);
}

vec4 unitToNdc(float x, float y) {
    return unitToNdc(vec2(x, y));
}

vec4 pixelsToNdc(vec2 coord) {
    return unitToNdc(coord / uViewportSize);
}

vec4 pixelsToNdc(float x, float y) {
    return pixelsToNdc(vec2(x, y));
}

float linearstep(float edge0, float edge1, float x) {
    return clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
}

// Fragment shader stuff ////////////////////////////////////////////////////////

// TODO: include the following only in fragment shaders

/**
 * Specialized linearstep for doing antialiasing
 */
float distanceToRatio(float d) {
	return clamp(d * uDevicePixelRatio + 0.5, 0.0, 1.0);
}

vec4 distanceToColor(float d, vec4 fill, vec4 stroke, float halfStrokeWidth) {
    if (halfStrokeWidth > 0.0) {
        // Distance to stroke's edge. Negative inside the stroke.
        float sd = abs(d) - halfStrokeWidth;
        return mix(
            stroke,
            d <= 0.0 ? fill : vec4(0.0),
            distanceToRatio(sd));
    } else {
        return fill * distanceToRatio(-d);
    }
}

vec4 distanceToColor2(float d, vec4 fill, vec4 stroke, float halfStrokeWidth) {
    if (halfStrokeWidth > 0.0) {
        // Distance to stroke's edge. Negative inside the stroke.
        float sd = abs(d) - halfStrokeWidth;
        return mix(
            stroke,
            d <= 0.0 ? fill : (vec4(0.0, 0.0, 0.0, 0.2) * distanceToRatio(-d - 1.0)),
            distanceToRatio(sd));
    } else {
        return fill * distanceToRatio(-d);
    }
}
