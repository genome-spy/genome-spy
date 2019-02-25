precision mediump float;

const vec4 white = vec4(vec3(1), 1);
const vec4 black = vec4(vec3(0), 1);

//varying float vSize;

void main() {
    float dist = distance(gl_PointCoord, vec2(0.5));

    if (dist > 0.5)
        discard;
    
    const vec4 color = vec4(1, 0.20, 0.10, 1);

    gl_FragColor = mix(
        (dist > 0.45 ? mix(color, black, 0.4) : color),
        white,
        0.25 - dist * 0.5);

}