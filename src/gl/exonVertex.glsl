
precision highp float;

attribute vec2 x;
attribute float y;

/** Exon width, negative if left vertex, positive if right vertex */
attribute float width;

uniform mat4 uTMatrix;
uniform vec2 uDomainBegin;
uniform vec2 uDomainWidth;

/** Minimum exon width when rendering */
uniform float minWidth;

/** Minimum exon opacity when the exon is narrower than the minimum width */
const float minOpacity = 0.30;

varying vec4 vColor;

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

    float normalizedWidth = width / uDomainWidth.x;

    float opacity;

    if (abs(normalizedWidth) < minWidth) {
        // The exon is too narrow, stretch it to make it more visible

        // TODO: Optimize the order of operations
        impreciseX += (minWidth * sign(width) - normalizedWidth) / 2.0;

        // Clamp opacity to ensure that all exons are at least somewhat visible
        // TODO: Could use gamma correction here
        opacity = max(abs(normalizedWidth) / minWidth, minOpacity);

    } else {
        opacity = 1.0;
    }

    gl_Position = uTMatrix * vec4(impreciseX, y, 0.0, 1.0);

    vColor = vec4(vec3(1.0 - opacity), 1.0);
}