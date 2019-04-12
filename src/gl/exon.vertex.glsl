
precision mediump float;

@import ./includes/xdomain;

attribute float y;

/** Exon width, negative if left vertex, positive if right vertex */
attribute float width;

uniform mat4 uTMatrix;

/** Minimum exon width when rendering */
uniform float uMinWidth;
uniform vec3 uColor;

/** Minimum exon opacity when the exon is narrower than the minimum width */
const float minOpacity = 0.20;

varying vec4 vColor;

void main(void) {
    
    float normalizedX = normalizeX();
    float normalizedWidth = width / uDomainWidth.x;

    float opacity;

    if (abs(normalizedWidth) < uMinWidth) {
        // The exon is too narrow, stretch it to make it more visible

        // TODO: Optimize the order of operations
        normalizedX += (uMinWidth * sign(width) - normalizedWidth) / 2.0;

        // Clamp opacity to ensure that all exons are at least somewhat visible
        // TODO: Could use gamma correction here
        opacity = max(abs(normalizedWidth) / uMinWidth, minOpacity);

    } else {
        opacity = 1.0;
    }

    gl_Position = uTMatrix * vec4(normalizedX, y, 0.0, 1.0);

    vColor = vec4(uColor, opacity);
}