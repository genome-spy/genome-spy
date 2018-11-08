precision highp float;

attribute vec2 x;
attribute float y;
attribute vec4 color;

uniform mat4 uTMatrix;
uniform vec2 uDomainBegin;
uniform vec2 uDomainWidth;

varying vec4 vColor;

//const float precisionThreshold = 1024.0 * 1024.0 * 64.0;
const float precisionThreshold = 1024.0 * 1024.0 * 8.0;

void main(void) {
    
    float impreciseX;

    if (uDomainWidth.x < precisionThreshold) {
        vec2 translated = sub_fp64(x, uDomainBegin);
        vec2 normalizedX = div_fp64(translated, uDomainWidth);

        impreciseX = normalizedX.x;

    } else {
        impreciseX = (x.x - uDomainBegin.x) / uDomainWidth.x;
    }

    gl_Position = uTMatrix * vec4(impreciseX, y, 0.0, 1.0);

    vColor = color;
}