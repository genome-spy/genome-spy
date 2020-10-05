float scaleIdentityFp64(vec2 value) {
    return value[0];
}

float scaleLinearFp64(vec2 value, vec4 domain, vec2 range) {
    vec2 domainSpan = sub_fp64(domain.zw, domain.xy);
    float rangeSpan = range[1] - range[0];

    float unitValue = div_fp64(sub_fp64(value, domain.xy), domainSpan).x;
    return unitValue * rangeSpan + range[0];
}
