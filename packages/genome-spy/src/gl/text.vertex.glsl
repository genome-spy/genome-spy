precision mediump float;

@import ./includes/xdomain;
@import ./includes/ydomain;
@import ./includes/sampleTransition;

uniform vec2 uViewportSize;
uniform lowp float uDevicePixelRatio;
uniform float uSdfNumerator;

uniform vec2 uD; // dx & dy

attribute highp vec2 x; // fp64
attribute float y;

attribute vec3 color;
attribute lowp float opacity;
attribute float size;

// TODO: Store as vec2
attribute float cx;
attribute float cy;

// TODO: Store as vec2
attribute lowp float tx;
attribute lowp float ty;

// Width of the text (all letters)
attribute float width;

#ifdef X2_ENABLED
attribute highp vec2 x2;
uniform float uPaddingX;
uniform float uAlign; // -1, 0, 1 = left, center, right
#endif

varying vec4 vColor;
varying vec2 vTexCoord;
varying float vSlope;

void main(void) {
    float normalizedX = normalizeX(x);

#ifdef X2_ENABLED
    float normalizedX2 = normalizeX(x2);

    float normalizedSpan = normalizedX2 - normalizedX;
    float normalizedPadding = uPaddingX / uViewportSize.x * uDevicePixelRatio;
    float paddedNormalizedWidth = width * size / uViewportSize.x * uDevicePixelRatio + 2.0 * normalizedPadding;

    bool outside = normalizedX > 1.0 || normalizedX2 < 0.0;
    bool doesntFit = normalizedSpan < paddedNormalizedWidth;

    if (outside || doesntFit) {
        gl_Position = vec4(0.0);
        return;
    }

    // Try to keep the text inside the span
    // TODO: Provide align as a const instead of an uniform
    if (uAlign == 0.0) {
        float centroid = normalizedX + normalizedX2;

        float leftOver = -(centroid - paddedNormalizedWidth);
        float rightOver = (centroid + paddedNormalizedWidth) - 2.0;

        if (leftOver > 0.0) {
            centroid += min(leftOver, normalizedSpan - paddedNormalizedWidth);
        } else if (rightOver > 0.0) {
            centroid -= min(rightOver, normalizedSpan - paddedNormalizedWidth);
        }
        normalizedX = centroid / 2.0;

    } else if (uAlign < 0.0) {
        float edge = normalizedX;
        float over = -edge;

        if (over > 0.0) {
            edge += min(over, normalizedSpan - paddedNormalizedWidth);
        }
        normalizedX = edge + normalizedPadding;

    } else {
        float edge = normalizedX2;
        float over = edge - 1.0;

        if (over > 0.0) {
            edge -= min(over, normalizedSpan - paddedNormalizedWidth);
        }
        normalizedX = edge - normalizedPadding;
    }
#endif

    float normalizedY = normalizeY(y);
    float translatedY = transit(normalizedX, normalizedY)[0];

    vec2 ndc = (vec2(normalizedX, translatedY) + (vec2(cx, cy) * size + uD) * uDevicePixelRatio / uViewportSize) * 2.0 - 1.0;

    // Controls antialiasing of the SDF
    vSlope = max(1.0, size / uSdfNumerator);

    gl_Position = vec4(ndc, 0.0, 1.0);
    vColor = vec4(color * opacity, opacity);

    vTexCoord = vec2(tx, ty);
}
