
precision highp float;

attribute vec2 x;
attribute vec4 color;
attribute float size;


uniform vec2 uDomainBegin;
uniform vec2 uDomainWidth;

/** Location and height of the band on the Y axis on a normalized [0, 1] scale */
uniform vec2 yPosLeft;
uniform vec2 yPosRight;

uniform float transitionOffset;

uniform float viewportHeight;

/** Maximum point size in pixels */
uniform float maxPointSizeAbsolute;

/** Maximum point size as the fraction of sample height */
uniform float maxPointSizeRelative;

//varying float vSize;

varying vec4 vColor;

const float precisionThreshold = 1024.0 * 1024.0 * 8.0;

void main(void) {
    
    const float y = 0.5;

    /** X coordinate on normalized [0, 1] scale */
    float normalizedX;

    if (uDomainWidth.x < precisionThreshold) {
        vec2 translated = sub_fp64(x, uDomainBegin);
        // Normalize to [0, 1]
        normalizedX = div_fp64(translated, uDomainWidth).x;

    } else {
        normalizedX = (x.x - uDomainBegin.x) / uDomainWidth.x;
    }

    float top;
    float height;

    if (yPosLeft == yPosRight) {
        top = yPosLeft[0];
        height = yPosLeft[1];

    } else {
        float fraction = smoothstep(0.0, 0.7 + transitionOffset, (normalizedX - transitionOffset) * 2.0);
        vec2 interpolated = mix(yPosLeft, yPosRight, fraction);
        top = interpolated[0];
        height = interpolated[1];
    }


    float translatedY = top + y * height;

    vec2 ndc = vec2(normalizedX, 1.0 - translatedY) * 2.0 - 1.0;

    gl_Position = vec4(ndc, 0.0, 1.0);

    gl_PointSize = size * min(maxPointSizeAbsolute, viewportHeight * height * maxPointSizeRelative);

    vColor = color;
    //vSize = size;
}