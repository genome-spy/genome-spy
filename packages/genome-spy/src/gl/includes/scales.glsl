vec3 getDiscreteColor(sampler2D s, int index) {
    return texelFetch(s, ivec2(index % textureSize(s, 0).x, 0), 0).rgb;
}

vec3 getInterpolatedColor(sampler2D s, float unitValue) {
    return texture(s, vec2(unitValue, 0.0)).rgb;
}

float scaleIdentity(float value) {
    return value;
}

float scaleLinear(float value, vec2 domain, vec2 range) {
    float domainSpan = domain[1] - domain[0];
    float rangeSpan = range[1] - range[0];
    return (value - domain[0]) / domainSpan * rangeSpan + range[0];
}

float scaleBand(float value, vec2 domainExtent, vec2 range,
                float paddingInner, float paddingOuter,
                float band) {

    // TODO: reverse
    float start = range[0];
    float stop = range[1];

    float n = domainExtent[1] - domainExtent[0];

    // Based on: https://github.com/d3/d3-scale/blob/master/src/band.js
    float step = (stop - start) / max(1.0, n - paddingInner + paddingOuter * 2.0);
    start += (stop - start - step * (n - paddingInner)) * 0.5;
    float bandwidth = step * (1.0 - paddingInner);

    return start + (value - domainExtent[0]) * step + bandwidth * band;
}
