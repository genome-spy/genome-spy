float scaleLinear(float value, vec2 domain) {
    return (value - domain[0]) / (domain[1] - domain[0]);
}
