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
uniform float uAlignX; // -1, 0, 1 = left, center, right
#endif

#ifdef y2_DEFINED
// Height of the text (font size)
in float height;

uniform float uPaddingY;
uniform float uAlignY; // -1, 0, 1 = top, middle, bottom 
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

/**
 * All measures are in [0, 1]
 */
RangeResult positionInsideRange(float a, float b, float width, float padding,
                                int align) {
    float span = b - a;
    float paddedWidth = width + 2.0 * padding;

    // Is the text clearly outside the viewport
    if (a > 1.0 || b < 0.0) {
        return RangeResult(0.0, 0.0);
    }

    // How much extra space we have for adjusting the position so that the
    // text stays inside the range.
    float extra = max(0.0, span - paddedWidth);

    float pos;

    // Align the text and try to keep it inside the range and the viewport
    if (align == 0) {
        float centre = a + b;

        float leftOver = max(0.0, paddedWidth - centre);
        centre += min(leftOver, extra);

        float rightOver = max(0.0, paddedWidth + centre - 2.0);
        centre -= min(rightOver, extra);

        pos = centre / 2.0;

    } else if (align < 0) {
        float edge = a;

        float over = max(0.0, -edge);
        edge += min(over, extra);

        pos = edge + padding;

    } else {
        float edge = b;

        float over = max(0.0, edge - 1.0);
        edge -= min(over, extra);

        pos = edge - padding;
    }

    // How the text should be scaled to make it fit inside the range (if it didn't fit).
    float scale = clamp((span - padding) / paddedWidth, 0.0, 1.0);

    // TODO: Fix padding in scale factor. Padding should stay constant
    return RangeResult(pos, scale);
}

void main(void) {
    float opacity = getScaled_opacity();
    float size = getScaled_size();
    float x = getScaled_x();

    // TODO: Configurable
    bool squeeze = true;

#ifdef x2_DEFINED
    RangeResult result = positionInsideRange(
        x, getScaled_x2(),
        size * width / uViewportSize.x, uPaddingX / uViewportSize.x,
        int(uAlignX));
    
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
