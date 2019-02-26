precision mediump float;

const vec4 white = vec4(vec3(1), 1);
const vec4 black = vec4(vec3(0), 1);

varying vec4 vColor;

void main() {
    float dist = distance(gl_PointCoord, vec2(0.5));

    if (dist > 0.5)
        discard;

    gl_FragColor = mix(
        (dist > 0.45 ? mix(vColor, black, 0.4) : vColor),
        white,
        0.25 - dist * 0.5);

}