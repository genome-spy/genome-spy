float scaleLinear(float value, vec2 domain) {
    return (value - domain[0]) / (domain[1] - domain[0])
}

// --------------

attribute highp channel_x;
uniform vec2 uDomain_x;

float getScaled_x() {
    return scaleLinear(channel_x, uDomain_x);
}

// --------------

float getScaled_x() {
    return 0.5;
}
