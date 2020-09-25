precision mediump float;

uniform vec2 uViewportSize;

@import ./includes/scales;
@import ./includes/sampleTransition;

#pragma SCALES_HERE

attribute lowp vec3 color;
attribute lowp float opacity;

/** Position along the rule */
attribute float pos;

/** Which side: -0.5 or 0.5 */
attribute float side;

/** Minimum rule length in pixels */
uniform float uMinLength;

uniform float uDashTextureSize;

varying vec4 vColor;

/** The distance from the beginning of the rule in pixels */
varying float vPixelPos;

void main(void) {
    // Stroke width in pixels
    float size = getScaled_size();

    vec2 a = vec2(getScaled_x(), getScaled_y());
    vec2 b = vec2(getScaled_x2(), getScaled_y2());

    //float translatedY = transit(x, y)[0];

    vec2 tangent = b - a;

    vec2 elongation = vec2(0.0);
    vec2 normalizedElongation = vec2(0.0);

    // Apply minimum length by moving the vertices at both ends of the rule
    if (uMinLength > 0.0 && (pos == 0.0 || pos == 1.0)) {
        float len = length(tangent * uViewportSize);
        // The length difference in pixels
        float diff = uMinLength - len;
        if (diff > 0.0) {
            // Elongation vector in pixels
            elongation = normalize(tangent) * diff * (pos - 0.5);
            // Next line works incorrectly with diagonal rules. TODO: Figure out what's the problem.
            normalizedElongation = elongation / uViewportSize;
        }
    }

    vec2 p = a + tangent * pos + normalizedElongation;

    // Extrude
    vec2 normal = normalize(vec2(-tangent.y, tangent.x) / uViewportSize);
    p += normal * side * size / uViewportSize;

    gl_Position = unitToNdc(p);

    vColor = vec4(color * opacity, opacity);

    if (uDashTextureSize > 0.0) {
        vPixelPos = length(tangent * pos * uViewportSize) + length(elongation) * (pos == 0.0 ? -1.0 : 1.0);
    }
}
