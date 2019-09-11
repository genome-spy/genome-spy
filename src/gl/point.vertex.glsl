precision mediump float;

@import ./includes/xdomain;
@import ./includes/ydomain;
@import ./includes/sampleTransition;

attribute lowp vec3 color;
attribute lowp float opacity;
attribute float size; // Diameter or width/height
attribute lowp float shape;
attribute float strokeWidth;

attribute float zoomThreshold;

uniform float viewportHeight;
uniform lowp float devicePixelRatio;

/** Maximum point size in pixels */
uniform lowp float maxMaxPointSizeAbsolute;

/** Minimum Maximum point size in pixels */
uniform lowp float minMaxPointSizeAbsolute;

/** Maximum point size as the fraction of sample height */
uniform lowp float maxPointSizeRelative;

uniform float zoomLevel;
uniform float fractionToShow;

varying vec4 vColor;
varying float vSize;
varying float vShape;
varying float vStrokeWidth;


float computeThresholdFactor() {
    float margin = zoomLevel * 0.005;
    return 1.0 - sqrt(smoothstep(zoomThreshold, zoomThreshold + margin, 1.0 - zoomLevel * fractionToShow));
}

float computeMaxSize(float height) {
    return max(smoothstep(0.0, 3.0, viewportHeight * height) * minMaxPointSizeAbsolute,
        min(maxMaxPointSizeAbsolute, viewportHeight * height * maxPointSizeRelative));
}

void main(void) {

    float thresholdFactor = computeThresholdFactor();
    float normalizedX = normalizeX();

    vec2 translated = transit(normalizedX, (1.0 - normalizeY()));
    float translatedY = translated[0];
    float height = translated[1];

    vec2 ndc = vec2(normalizedX, 1.0 - translatedY) * 2.0 - 1.0;

    gl_Position = vec4(ndc, 0.0, 1.0);

    vSize = size * computeMaxSize(height) * thresholdFactor * devicePixelRatio;

    gl_PointSize = vSize;

    vColor = vec4(color, opacity * thresholdFactor);
    vShape = shape;
    vStrokeWidth = strokeWidth;
}