precision mediump float;

@import ./includes/xdomain;
@import ./includes/ydomain;
@import ./includes/minWidth;
@import ./includes/sampleTransition;

attribute vec4 color;
attribute lowp float opacity;

varying vec4 vColor;


void main(void) {
    float normalizedX = normalizeX();

    float opa = opacity * applyMinWidth(normalizedX);

    float translatedY = transit(normalizedX, 1.0 - normalizeY())[0];

    vec2 ndc = vec2(normalizedX, 1.0 - translatedY) * 2.0 - 1.0;

    gl_Position = vec4(ndc, 0.0, 1.0);
    vColor = vec4(color.rgb * opa, opa);
}