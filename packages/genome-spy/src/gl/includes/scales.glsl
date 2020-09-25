float scaleLinear(float value, vec2 domain) {
    return (value - domain[0]) / (domain[1] - domain[0]);
}

// -------
// Not really scales but common stuff. TODO: An own file

// Maps a coordinate on unit scale to normalized device coordinates
vec4 unitToNdc(vec2 coord) {
    return vec4(coord * 2.0 - 1.0, 0.0, 1.0);
}

vec4 unitToNdc(float x, float y) {
    return unitToNdc(vec2(x, y));
}
