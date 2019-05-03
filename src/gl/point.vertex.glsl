precision mediump float;

@import ./includes/xdomain;
@import ./includes/sampleTransition;

attribute lowp vec4 color;
attribute float size;

attribute float zoomThreshold;

uniform float viewportHeight;

/** Maximum point size in pixels */
uniform lowp float maxPointSizeAbsolute;

/** Maximum point size as the fraction of sample height */
uniform lowp float maxPointSizeRelative;

uniform float zoomLevel;
uniform float fractionToShow;

varying vec4 vColor;
varying float vOpacity;
varying float vSize;

void main(void) {
    
    // TODO: Allow using y for visual encoding
    const float y = 0.5;

    float normalizedX = normalizeX();

    vec2 translated = transit(normalizedX, y);
    float translatedY = translated[0];
    float height = translated[1];

    vec2 ndc = vec2(normalizedX, 1.0 - translatedY) * 2.0 - 1.0;

    gl_Position = vec4(ndc, 0.0, 1.0);

    float margin = zoomLevel * 0.005;

    float thresholdFactor = 1.0 - sqrt(smoothstep(zoomThreshold, zoomThreshold + margin, 1.0 - zoomLevel * fractionToShow));
    vSize = size * min(maxPointSizeAbsolute, viewportHeight * height * maxPointSizeRelative) * thresholdFactor;

    gl_PointSize = vSize;

    vColor = color;
    vOpacity = thresholdFactor;
}