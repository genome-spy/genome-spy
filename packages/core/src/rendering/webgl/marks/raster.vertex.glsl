precision highp float;

uniform vec2 uTarget;
uniform vec4 uRect;
uniform vec2 uTriangle; // Baseline in target pixels, signed axis direction.

void main() {
    vec2 corner = vec2(gl_VertexID & 1, gl_VertexID >> 1);
    vec2 pixel = mix(uRect.xy, uRect.zw, corner);
    if (uTriangle.y != 0.0) {
        pixel = vec2(0.5 * (pixel.x + pixel.y),
            uTriangle.x + uTriangle.y * 0.5 * (pixel.x - pixel.y));
    }
    vec2 unit = pixel / uTarget;
    gl_Position = vec4(unit * vec2(2.0, -2.0) + vec2(-1.0, 1.0), 0.0, 1.0);
}
