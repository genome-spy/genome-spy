precision mediump float;

@import ./includes/xdomain;
@import ./includes/ydomain;
@import ./includes/sampleTransition;

uniform vec2 uViewportSize;
uniform lowp float uDevicePixelRatio;
uniform float uSdfNumerator;

/**
 * X coordinate of the vertex as fp64 (emulated 64bit floating point)
 */
attribute highp vec2 x;
attribute float y;

// TODO: Store as vec2
attribute float cx;
attribute float cy;

// TODO: Store as vec2
attribute float tx;
attribute float ty;

attribute vec3 color;
attribute lowp float opacity;
attribute float size;


varying vec4 vColor;
varying vec2 vTexCoord;
varying float vSlope;

void main(void) {
    float normalizedX = normalizeX(x);
    float normalizedY = normalizeY(y);
    
    float translatedY = transit(normalizedX, normalizedY)[0];

    vec2 ndc = (vec2(normalizedX, translatedY) + vec2(cx, cy) * size * uDevicePixelRatio / uViewportSize) * 2.0 - 1.0;

    vSlope = max(1.0, size / uSdfNumerator);

    gl_Position = vec4(ndc, 0.0, 1.0);
    vColor = vec4(color * opacity, opacity);

    vTexCoord = vec2(tx, ty);
}
