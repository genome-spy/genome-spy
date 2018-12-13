precision highp float;

attribute vec2 x;
attribute float y;
attribute float yEdge;

uniform mat4 uTMatrix;
uniform vec2 uDomainBegin;
uniform vec2 uDomainWidth;

varying float vYPos;

//const float precisionThreshold = 1024.0 * 1024.0 * 64.0;
const float precisionThreshold = 1024.0 * 1024.0 * 8.0;

void main(void) {
    vec2 translated = sub_fp64(x, uDomainBegin);
    vec2 normalizedX = div_fp64(translated, uDomainWidth);

    float impreciseX = normalizedX.x;

    gl_Position = uTMatrix * vec4(impreciseX, y, 0.0, 1.0);

    vYPos = yEdge;
}