precision mediump float;

@import ./includes/xdomain;
@import ./includes/ydomain;
@import ./includes/sampleTransition;

/**
 * X coordinate of the vertex as fp64 (emulated 64bit floating point)
 */
attribute highp vec2 x;
attribute highp float y;

attribute lowp vec3 color;
attribute lowp float opacity;
attribute float size; // Diameter or width/height
attribute lowp float shape;
attribute lowp float strokeWidth;
attribute float semanticScore;
attribute lowp float gradientStrength;

uniform vec2 uViewportSize;
uniform lowp float uDevicePixelRatio;

/** Maximum size of the largest point as the fraction of the height of the (faceted) view */
uniform lowp float uMaxRelativePointDiameter;
/** Minimum width/height in pixels of the largest point */
uniform lowp float uMinAbsolutePointDiameter;

/** Scale factor for geometric zoom */
uniform float uScaleFactor;

/** The size of the largest point in the data */
uniform float uMaxPointSize;

uniform float zoomLevel;
uniform float uSemanticThreshold;

varying float vSize;
varying lowp vec4 vColor;
varying lowp float vShape;
varying lowp float vStrokeWidth;
varying lowp float vGradientStrength;


float computeThresholdFactor() {
    //float margin = zoomLevel * 0.005;
    //return 1.0 - smoothstep(zoomThreshold, zoomThreshold + margin, 1.0 - zoomLevel * fractionToShow);
    return semanticScore >= uSemanticThreshold ? 1.0 : 0.0;
}

/**
 * Computes a scaling factor for the points.
 * To some extent, this could be done in JavaScript and passed as uniform.
 * It would consume more cpu cycles, though.
 */
float scaleDown(float bandHeight) {
    float maxPointDiameter = sqrt(uMaxPointSize);
    // TODO: Optimize: we first divide by DPR here and later multiply by it
    float factor = bandHeight * uMaxRelativePointDiameter / uDevicePixelRatio;

    // Points should not be visible on zero-height bands. Using smoothstep to hide them.
    float minimum = smoothstep(0.0, 0.5, bandHeight) * uMinAbsolutePointDiameter / uDevicePixelRatio;

    return max(minimum, min(maxPointDiameter, factor)) / maxPointDiameter;
}

void main(void) {

    float thresholdFactor = computeThresholdFactor();
    if (thresholdFactor <= 0.0) {
        gl_PointSize = 0.0;
        // Exit early. MAY prevent some unnecessary calculations.
        return;
    }

    float normalizedX = normalizeX(x);

    vec2 translated = transit(normalizedX, (1.0 - normalizeY(y)));
    float translatedY = translated[0];
    float height = translated[1];

    vec2 ndc = vec2(normalizedX, 1.0 - translatedY) * 2.0 - 1.0;

    gl_Position = vec4(ndc, 0.0, 1.0);

    vSize = sqrt(size) *
        uScaleFactor *
        scaleDown(height * uViewportSize.y) *
        thresholdFactor *
        uDevicePixelRatio;

    // Clamp minimum size and adjust opacity instead. Yields more pleasing result,
    // no flickering etc.
    float opa;
    const float sizeLimit = 2.0;
    if (vSize < sizeLimit) {
        // We do some "cheap" gamma correction here. It breaks on dark background, though.
        // First we take a square of the size and then apply "gamma" of 1.5.
        opa = opacity * pow(vSize / sizeLimit, 2.5);
        vSize = sizeLimit;
    } else {
        opa = opacity;
    }

    gl_PointSize = vSize;

    vColor = vec4(color, opa * thresholdFactor);
    vShape = shape;
    vStrokeWidth = strokeWidth;
    vGradientStrength = gradientStrength;
}
