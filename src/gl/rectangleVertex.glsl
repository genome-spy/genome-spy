precision highp float;

attribute vec2 x;
attribute float y;
attribute vec4 color;

uniform vec2 uDomainBegin;
uniform vec2 uDomainWidth;

/** Location and height of the band on the Y axis on a normalized [0, 1] scale */
uniform vec2 yPos;

varying vec4 vColor;

const float precisionThreshold = 1024.0 * 1024.0 * 8.0;


void main(void) {
    
    float impreciseX;

    if (uDomainWidth.x < precisionThreshold) {
        vec2 translated = sub_fp64(x, uDomainBegin);
        // Normalize to [0, 1]
        vec2 normalizedX = div_fp64(translated, uDomainWidth);

        impreciseX = normalizedX.x;

    } else {
        impreciseX = (x.x - uDomainBegin.x) / uDomainWidth.x;
    }

    float top = yPos[0];
    float height = yPos[1];
    float translatedY = top + y * height;

    vec2 ndc = vec2(impreciseX, 1.0 - translatedY) * 2.0 - 1.0;

    gl_Position = vec4(ndc, 0.0, 1.0);

    vColor = color;
}