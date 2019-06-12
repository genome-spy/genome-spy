precision mediump float;

@import ./includes/xdomain;
@import ./includes/ydomain;
@import ./includes/minWidth;
@import ./includes/sampleTransition;

attribute vec3 color;
attribute lowp float opacity;

/**
 * Height of the rectangle.
 *
 * Negative if the top vertex, positive if the bottom vertex.
 */
attribute float height;

/** Minimum height of the displayed rectangle in normalized [0, 1] coordinates */
uniform float uMinHeight;

varying vec4 vColor;


float applyMinHeight(float normalizedY) {
    if (height != 0.0 && uYDomainWidth > 0.0) {
        float normalizedHeight = height / uYDomainWidth * yPosLeft[1]; // TODO: Fix: Broken inside transition!
        if (abs(normalizedHeight) < uMinHeight) {
            normalizedY += (uMinHeight * sign(height) - normalizedHeight) / 2.0;
        }
    }

    return normalizedY;
}

void main(void) {
    float normalizedX = normalizeX();
    float normalizedY = normalizeY();
    
    float opa = opacity * applyMinWidth(normalizedX);

    float translatedY = transit(normalizedX, 1.0 - normalizedY)[0];

    translatedY = applyMinHeight(translatedY);

    vec2 ndc = vec2(normalizedX, 1.0 - translatedY) * 2.0 - 1.0;

    gl_Position = vec4(ndc, 0.0, 1.0);
    vColor = vec4(color * opa, opa);
}
