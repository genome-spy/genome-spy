float scaleIdentityFp64(vec2 value) {
    return value[0];
}

float scaleLinearFp64(vec2 value, vec4 domain, vec2 range) {
    vec2 domainSpan = sub_fp64(domain.zw, domain.xy);
    float rangeSpan = range[1] - range[0];

    float unitValue = div_fp64(sub_fp64(value, domain.xy), domainSpan).x;
    return unitValue * rangeSpan + range[0];
}

float scaleBandFp64(vec2 value, vec4 domainExtent, vec2 range,
                float paddingInner, float paddingOuter,
                float band) {

    // TODO: reverse
    float start = range[0];
    float stop = range[1];

    vec2 domainSpan = sub_fp64(domainExtent.zw, domainExtent.xy);
    float n = domainSpan.x;

    // Based on: https://github.com/d3/d3-scale/blob/master/src/band.js
    float step = (stop - start) / max(1.0, n - paddingInner + paddingOuter * 2.0);
    start += (stop - start - step * (n - paddingInner)) * 0.5;
    float bandwidth = step * (1.0 - paddingInner);

    return start + sub_fp64(value, domainExtent.xy).x * step + bandwidth * band;
}
