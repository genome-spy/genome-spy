#pragma SCALES_HERE

uniform float uSdfNumerator;

uniform vec2 uD; // dx & dy
uniform float uAngle;

attribute vec3 color;

// TODO: Store as vec2
attribute float cx;
attribute float cy;

// TODO: Store as vec2
attribute lowp float tx;
attribute lowp float ty;

// Width of the text (all letters)
attribute float width;

#ifdef x2_DEFINED
uniform float uPaddingX;
uniform float uAlign; // -1, 0, 1 = left, center, right
#endif

varying vec4 vColor;
varying vec2 vTexCoord;
varying float vSlope;

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
        float centroid = x + x2;

        float leftOver = -(centroid - paddedNormalizedWidth);
        float rightOver = (centroid + paddedNormalizedWidth) - 2.0;

        if (leftOver > 0.0) {
            centroid += min(leftOver, normalizedSpan - paddedNormalizedWidth);
        } else if (rightOver > 0.0) {
            centroid -= min(rightOver, normalizedSpan - paddedNormalizedWidth);
        }
        x = centroid / 2.0;

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
    float translatedY = transit(x, y)[0];

    float sinTheta = sin(uAngle);
    float cosTheta = cos(uAngle);
    mat2 rotation = mat2(cosTheta, sinTheta, -sinTheta, cosTheta);

    vec2 pos = rotation * (vec2(cx, cy) * size + uD);

    gl_Position = unitToNdc(vec2(x, translatedY) + pos / uViewportSize);

    // Controls antialiasing of the SDF
    vSlope = max(1.0, size / uSdfNumerator);

    vColor = vec4(color * opacity, opacity);

    vTexCoord = vec2(tx, ty);
}
