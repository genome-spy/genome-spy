#define PI 3.141593

uniform View {
    /** Offset in "unit" units */
    mediump vec2 uViewOffset;
    mediump vec2 uViewScale;
    /** Size of the logical viewport in pixels, i.e., the view */
    mediump vec2 uViewportSize;
    lowp float uDevicePixelRatio;
    // TODO: Views with opacity less than 1.0 should be rendered into a texture
    // that is rendered with the specified opacity.
    lowp float uViewOpacity;
    bool uPickingEnabled;
};


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

const highp uint HASH_EMPTY_KEY = 0xffffffffu;

highp uint hash32(highp uint key) {
    highp uint v = key;
    v ^= v >> 16u;
    v *= 0x7feb352du;
    v ^= v >> 15u;
    v *= 0x846ca68bu;
    v ^= v >> 16u;
    return v;
}

bool isEmptyHashTexture(highp usampler2D s) {
    // Empty selections are encoded as a single empty hash slot.
    ivec2 texSize = textureSize(s, 0);
    return texSize.x == 1 && texSize.y == 1 && texelFetch(s, ivec2(0, 0), 0).r == HASH_EMPTY_KEY;
}

bool hashContainsTexture(highp usampler2D s, highp uint value) {
    ivec2 texSize = textureSize(s, 0);
    highp uint width = uint(texSize.x);
    highp uint size = width * uint(texSize.y);
    highp uint mask = size - 1u;
    highp uint index = hash32(value) & mask;

    for (highp uint probe = 0u; probe < size; probe += 1u) {
        ivec2 coord = ivec2(int(index % width), int(index / width));
        highp uint entry = texelFetch(s, coord, 0).r;
        if (entry == value) {
            return true;
        }
        if (entry == HASH_EMPTY_KEY) {
            return false;
        }
        index = (index + 1u) & mask;
    }

    return false;
}

/**
 * Calculates a gamma for antialiasing opacity based on the color.
 */
float getGammaForColor(vec3 rgb) {
    return mix(
        1.25,
        0.75,
        // RGB should be linearized but this is good enough for now
        smoothstep(0.0, 1.0, dot(rgb, vec3(0.299, 0.587, 0.114))));
}

// Fragment shader stuff ////////////////////////////////////////////////////////

// TODO: include the following only in fragment shaders

/**
 * Specialized linearstep for doing antialiasing
 */
float distanceToRatio(float d) {
	return clamp(d * uDevicePixelRatio + 0.5, 0.0, 1.0);
}

vec4 distanceToColor(float d, vec4 fill, vec4 stroke, vec4 background, float halfStrokeWidth) {
    if (halfStrokeWidth > 0.0) {
        // Distance to stroke's edge. Negative inside the stroke.
        float sd = abs(d) - halfStrokeWidth;
        return mix(
            stroke,
            d <= 0.0 ? fill : background,
            distanceToRatio(sd));
    } else {
        return mix(background, fill, distanceToRatio(-d));
    }
}
