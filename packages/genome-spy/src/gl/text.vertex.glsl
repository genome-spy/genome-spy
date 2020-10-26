#pragma SCALES_HERE

uniform float uSdfNumerator;

uniform vec2 uD; // dx & dy
uniform float uAngle;

in vec3 color;

// TODO: Store as vec2
in float cx;
in float cy;

// TODO: Store as vec2
in lowp float tx;
in lowp float ty;

uniform vec4 uViewportEdgeFadeWidth;
uniform vec4 uViewportEdgeFadeDistance;
    

#ifdef x2_DEFINED
// Width of the text (all letters)
in float width;

uniform float uPaddingX;
uniform float uAlign; // -1, 0, 1 = left, center, right
#endif

out vec4 vColor;
out vec2 vTexCoord;
out float vSlope;
out float vEdgeFadeOpacity;


float minValue(vec4 v) {
    return min(min(v.x, v.y), min(v.z, v.w));
}

float maxValue(vec4 v) {
    return max(max(v.x, v.y), max(v.z, v.w));
}

void main(void) {
    float opacity = getScaled_opacity();
    float size = getScaled_size();
    float x = getScaled_x();

#ifdef x2_DEFINED
    float x2 = getScaled_x2();

    float normalizedSpan = x2 - x;
    float normalizedPadding = uPaddingX / uViewportSize.x;
    float paddedNormalizedWidth = width * size / uViewportSize.x + 2.0 * normalizedPadding;

    bool outside = x > 1.0 || x2 < 0.0;
    bool doesntFit = normalizedSpan < paddedNormalizedWidth;

    if (outside || doesntFit) {
        gl_Position = vec4(0.0);
        return;
    }

    // Try to keep the text inside the span
    // TODO: Provide align as a const instead of an uniform
    if (uAlign == 0.0) {
        float centre = x + x2;

        float leftOver = -(centre- paddedNormalizedWidth);
        float rightOver = (centre+ paddedNormalizedWidth) - 2.0;

        if (leftOver > 0.0) {
            centre += min(leftOver, normalizedSpan - paddedNormalizedWidth);
        } else if (rightOver > 0.0) {
            centre -= min(rightOver, normalizedSpan - paddedNormalizedWidth);
        }
        x = centre / 2.0;

    } else if (uAlign < 0.0) {
        float edge = x;
        float over = -edge;

        if (over > 0.0) {
            edge += min(over, normalizedSpan - paddedNormalizedWidth);
        }
        x = edge + normalizedPadding;

    } else {
        float edge = x2;
        float over = edge - 1.0;

        if (over > 0.0) {
            edge -= min(over, normalizedSpan - paddedNormalizedWidth);
        }
        x = edge - normalizedPadding;
    }
#endif

    float y = getScaled_y();

    // Position of the text origo 
    vec2 pos = applySampleFacet(vec2(x, y));

    float sinTheta = sin(uAngle);
    float cosTheta = cos(uAngle);
    mat2 rotationMatrix = mat2(cosTheta, sinTheta, -sinTheta, cosTheta);

    // Position of the character vertex in relation to the text origo
    vec2 charPos = rotationMatrix * (vec2(cx, cy) * size + uD);

    // Position of the character vertex inside the unit viewport
    vec2 unitPos = pos + charPos / uViewportSize;

    gl_Position = unitToNdc(unitPos);

    // Controls antialiasing of the SDF
    vSlope = max(1.0, size / uSdfNumerator);

    vColor = vec4(color * opacity, opacity);

    vTexCoord = vec2(tx, ty);

    // Edge fading. The implementation is simplistic and fails with primitives that
    // span the whole viewport. However, it works just fine with reasonable font sizes.
    // x: top, y: right, z: bottom, w: left
    if (maxValue(uViewportEdgeFadeDistance) > -pow(10.0, 10.0)) { // -Infinity would be nice
        vEdgeFadeOpacity = minValue(
            ((vec4(1.0, 1.0, 0.0, 0.0) + vec4(-1.0, -1.0, 1.0, 1.0) * unitPos.yxyx) *
                uViewportSize.yxyx - uViewportEdgeFadeDistance) / uViewportEdgeFadeWidth);
    } else {
        vEdgeFadeOpacity = 1.0;
    }

}
