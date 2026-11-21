precision highp float;

uniform vec2 uTarget;
uniform vec4 uRect;

void main() {
    vec2 corner = vec2(gl_VertexID & 1, gl_VertexID >> 1);
    vec2 pixel = mix(uRect.xy, uRect.zw, corner);
    vec2 unit = pixel / uTarget;
    gl_Position = vec4(unit * vec2(2.0, -2.0) + vec2(-1.0, 1.0), 0.0, 1.0);
}
