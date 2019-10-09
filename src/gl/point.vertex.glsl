precision mediump float;

@import ./includes/xdomain;
@import ./includes/ydomain;
@import ./includes/sampleTransition;

attribute lowp vec3 color;
attribute lowp float opacity;
attribute float size; // Diameter or width/height
attribute lowp float shape;
attribute lowp float strokeWidth;
attribute float zoomThreshold;
attribute lowp float gradientStrength;

uniform float viewportHeight;
uniform lowp float devicePixelRatio;

/** Maximum point size as the fraction of sample height */
uniform lowp float maxPointSizeRelative;

/** Scale factor for geometric zoom */
uniform float uScaleFactor;

/** The size of the largest point in the data */
uniform float uMaxPointSize;

uniform float zoomLevel;
uniform float fractionToShow;

varying float vSize;
varying lowp vec4 vColor;
varying lowp float vShape;
varying lowp float vStrokeWidth;
varying lowp float vGradientStrength;


float computeThresholdFactor() {
    float margin = zoomLevel * 0.005;
    return 1.0 - smoothstep(zoomThreshold, zoomThreshold + margin, 1.0 - zoomLevel * fractionToShow);
}

float scaleDown(float bandHeight) {
    float factor = bandHeight * maxPointSizeRelative / sqrt(uMaxPointSize);

    return min(1.0, factor);
}

void main(void) {

    float normalizedX = normalizeX();

    vec2 translated = transit(normalizedX, (1.0 - normalizeY()));
    float translatedY = translated[0];
    float height = translated[1];

    vec2 ndc = vec2(normalizedX, 1.0 - translatedY) * 2.0 - 1.0;

    gl_Position = vec4(ndc, 0.0, 1.0);

    float thresholdFactor = computeThresholdFactor();

    vSize = sqrt(size) *
        uScaleFactor *
        scaleDown(height * viewportHeight) *
        thresholdFactor *
        devicePixelRatio;

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