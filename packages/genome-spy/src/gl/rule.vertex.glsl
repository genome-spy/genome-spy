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

varying vec4 vColor;

void main(void) {
    // Stroke width in pixels
    float size = getScaled_size();

    vec2 a = vec2(getScaled_x(), getScaled_y());
    vec2 b = vec2(getScaled_x2(), getScaled_y2());

    //float translatedY = transit(x, y)[0];

    vec2 tangent = b - a;
    vec2 normal = normalize(vec2(-tangent.y, tangent.x) / uViewportSize);

    vec2 p = a + tangent * pos;

    if (uMinLength > 0.0 && (pos == 0.0 || pos == 1.0)) {
        float len = length(tangent * uViewportSize);
        float diff = uMinLength - len;
        if (diff > 0.0) {
            // Elongate
            p += normalize(tangent) * diff * (pos - 0.5) / length(uViewportSize);
        }
    }

    // Extrude
    p += normal * side * size / uViewportSize;

    gl_Position = unitToNdc(p);

    vColor = vec4(color * opacity, opacity);
}
