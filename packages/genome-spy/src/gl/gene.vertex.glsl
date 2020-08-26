precision mediump float;

/**
 * X coordinate of the vertex as fp64 (emulated 64bit floating point)
 */
attribute highp vec2 x;

@import ./includes/xdomain;

attribute float y;
attribute float yEdge;

uniform mat4 uTMatrix;

varying float vYPos;

void main(void) {
    float normalizedX = normalizeX(x);

    gl_Position = uTMatrix * vec4(normalizedX, y, 0.0, 1.0);

    vYPos = yEdge;
}
