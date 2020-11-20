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

struct RangeResult {
    float pos;
    float scale;
};

float minValue(vec4 v) {
    return min(min(v.x, v.y), min(v.z, v.w));
}

float maxValue(vec4 v) {
    return max(max(v.x, v.y), max(v.z, v.w));
}

RangeResult positionInsideRange(float a, float b, float size, float fontSize,
                          float padding, int align, float viewportSize) {
    float normalizedSpan = b - a;
    float normalizedPadding = padding / viewportSize;
    float paddedNormalizedWidth = size * fontSize / viewportSize + 2.0 * normalizedPadding;

    if (a > 1.0 || b < 0.0) {
        return RangeResult(0.0, 0.0);
    }

    // TODO: Scale goes below 1.0 a bit too early. Figure out why.
    float scale = clamp((normalizedSpan - normalizedPadding) / paddedNormalizedWidth, 0.0, 1.0);

    float pos;

    // Try to keep the text inside the span
    if (align == 0) {
        float centre = a + b;

        if (scale >= 1.0) {
            float leftOver = -(centre - paddedNormalizedWidth);
            float rightOver = (centre + paddedNormalizedWidth) - 2.0;

            if (leftOver > 0.0) {
                centre += min(leftOver, normalizedSpan - paddedNormalizedWidth);
            } else if (rightOver > 0.0) {
                centre -= min(rightOver, normalizedSpan - paddedNormalizedWidth);
            }
        }
        pos = centre / 2.0;

    } else if (align < 0) {
        float edge = a;
        if (scale >= 1.0) {
            float over = -edge;

            if (over > 0.0) {
                edge += min(over, normalizedSpan - paddedNormalizedWidth);
            }
        }
        pos = edge + normalizedPadding;

    } else {
        float edge = b;
        if (scale >= 1.0) {
            float over = edge - 1.0;

            if (over > 0.0) {
                edge -= min(over, normalizedSpan - paddedNormalizedWidth);
            }
        }
        pos = edge - normalizedPadding;
    }

    // TODO: Fix padding in scale factor. Padding should stay constant
    return RangeResult(pos, scale);
}

void main(void) {
    float opacity = getScaled_opacity();
    float size = getScaled_size();
    float x = getScaled_x();

    bool squeeze = true;

#ifdef x2_DEFINED
    RangeResult result = positionInsideRange(
        x, getScaled_x2(), width, size,
        uPaddingX, int(uAlign), uViewportSize.x);
    
    x = result.pos;

    if (squeeze) {
        vec2 scaleFadeExtent = vec2(3.0, 6.0) / size;

        if (result.scale < scaleFadeExtent[0]) {
            gl_Position = vec4(0.0);
            return;
        }

        size *= result.scale;
        opacity *= smoothstep(scaleFadeExtent[0], scaleFadeExtent[1], result.scale); // TODO: "linearstep"

    } else if (result.scale < 1.0) {
        gl_Position = vec4(0.0);
        return;
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
