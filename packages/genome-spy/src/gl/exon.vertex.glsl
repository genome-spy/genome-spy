
precision mediump float;

/**
 * X coordinate of the vertex as fp64 (emulated 64bit floating point)
 */
attribute highp vec2 x;
attribute highp float y;

@import ./includes/xdomain;
@import ./includes/ydomain;
@import ./includes/minWidth;

//attribute float y;

uniform mat4 uTMatrix;

/** Minimum exon width when rendering */
uniform vec3 uColor;

varying vec4 vColor;

void main(void) {
    
    float normalizedX = normalizeX(x);
    float opacity = applyMinWidth(normalizedX);

    gl_Position = uTMatrix * vec4(normalizedX, y, 0.0, 1.0);

    vColor = vec4(uColor, opacity);
}
