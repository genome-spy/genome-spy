precision mediump float;

@import ./includes/xdomain;

attribute float y;
attribute float yEdge;

uniform mat4 uTMatrix;

varying float vYPos;

void main(void) {
    float normalizedX = normalizeX();

    gl_Position = uTMatrix * vec4(normalizedX, y, 0.0, 1.0);

    vYPos = yEdge;
}