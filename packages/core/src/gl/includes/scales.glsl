uniform highp float uZero;

// Utils ------------

vec3 getDiscreteColor(sampler2D s, int index) {
    return texelFetch(s, ivec2(index % textureSize(s, 0).x, 0), 0).rgb;
}

vec3 getInterpolatedColor(sampler2D s, float unitValue) {
    return texture(s, vec2(unitValue, 0.0)).rgb;
}

float clampToRange(float value, vec2 range) {
    return clamp(value, min(range[0], range[1]), max(range[0], range[1]));
}

// Scales ------------
// Based on d3 scales: https://github.com/d3/d3-scale

float scaleIdentity(float value) {
    return value;
}

float scaleIdentity(uint value) {
    return float(value);
}

float scaleLinear(float value, vec2 domain, vec2 range) {
    float domainSpan = domain[1] - domain[0];
    float rangeSpan = range[1] - range[0];
    return (value - domain[0]) / domainSpan * rangeSpan + range[0];
}

float scaleLog(float value, vec2 domain, vec2 range, float base) {
    // y = m log(x) + b 
    // TODO: Perf optimization: precalculate log domain in js.
    // TODO: Reversed domain, etc
    return scaleLinear(log(value) / log(base), log(domain) / log(base), range);
}

float symlog(float value, float constant) {
    // WARNING: emulating log1p with log(x + 1). Small numbers are likely to
    // have significant precision problems.
    return sign(value) * log(abs(value / constant) + 1.0);
}

float scaleSymlog(float value, vec2 domain, vec2 range, float constant) {
    return scaleLinear(
        symlog(value, constant),
        vec2(symlog(domain[0], constant), symlog(domain[1], constant)),
        range
    );
}

float scalePow(float value, vec2 domain, vec2 range, float exponent) {
    // y = mx^k + b
    // TODO: Perf optimization: precalculate pow domain in js.
    // TODO: Reversed domain, etc
    return scaleLinear(
        pow(abs(value), exponent) * sign(value),
        pow(abs(domain), vec2(exponent)) * sign(domain),
        range
    );
}

// TODO: scaleThreshold
// TODO: scaleQuantile (special case of threshold scale)

// TODO: domainExtent should be uint
float scaleBand(uint value, vec2 domainExtent, vec2 range,
                float paddingInner, float paddingOuter,
                float align, float band) {

    // TODO: reverse
    float start = range[0];
    float stop = range[1];
    float rangeSpan = stop - start;

    float n = domainExtent[1] - domainExtent[0];

    // This fix departs from Vega and d3: https://github.com/vega/vega/issues/3357#issuecomment-1063253596
    paddingInner = int(n) > 1 ? paddingInner : 0.0;

    // Adapted from: https://github.com/d3/d3-scale/blob/master/src/band.js
    float step = rangeSpan / max(1.0, n - paddingInner + paddingOuter * 2.0);
    start += (rangeSpan - step * (n - paddingInner)) * align;
    float bandwidth = step * (1.0 - paddingInner);

    return start + (float(value) - domainExtent[0]) * step + bandwidth * band;
}

const int lowBits = 12;
const float lowDivisor = pow(2.0, float(lowBits));
const uint lowMask = uint(lowDivisor - 1.0);

vec2 splitUint(uint value) {
    uint valueLo = value & lowMask;
    uint valueHi = value - valueLo;
    return vec2(float(valueHi), float(valueLo));
}

/**
 * High precision variant of scaleBand for index/locus scales
 */
float scaleBandHp(uint value, vec3 domainExtent, vec2 range,
                 float paddingInner, float paddingOuter,
                 float align, float band) {

    // TODO: reverse
    float start = range[0];
    float stop = range[1];
    float rangeSpan = stop - start;

    vec2 domainStart = domainExtent.xy;
    float n = domainExtent[2];

    // The following computation is identical for every vertex. Could be done on the JS side.
    float step = rangeSpan / max(1.0, n - paddingInner + paddingOuter * 2.0);
    start += (rangeSpan - step * (n - paddingInner)) * align;
    float bandwidth = step * (1.0 - paddingInner);

    // Split into to values with each having a reduced number of significant digits
    // to mitigate the lack of precision in float32 calculations.
    vec2 splitValue = splitUint(value);

    // Using max to prevent the shader compiler from wrecking the precision.
    // Othwewise the compiler could optimize the sum of the four terms into
    // some equivalent form that does premature rounding.
    float inf = 1.0 / uZero;
    float hi = max(splitValue[0] - domainStart[0], -inf);
    float lo = max(splitValue[1] - domainStart[1], -inf);

    return dot(vec4(start, hi, lo, bandwidth), vec4(1.0, step, step, band));
}

/**
 * High precision variant of scaleBand for index/locus scales for large
 * domains where 32bit uints are not sufficient to represent the domain.
 */
float scaleBandHp(uvec2 value, vec3 domainExtent, vec2 range,
                 float paddingInner, float paddingOuter,
                 float align, float band) {

    // TODO: reverse
    float start = range[0];
    float stop = range[1];
    float rangeSpan = stop - start;

    vec2 domainStart = domainExtent.xy;
    float n = domainExtent[2];

    // The following computation is identical for every vertex. Could be done on the JS side.
    float step = rangeSpan / max(1.0, n - paddingInner + paddingOuter * 2.0);
    start += (rangeSpan - step * (n - paddingInner)) * align;
    float bandwidth = step * (1.0 - paddingInner);

    // Split into to values with each having a reduced number of significant digits
    // to mitigate the lack of precision in float32 calculations.
    vec2 splitValue = vec2(float(value[0]) * lowDivisor, float(value[1]));

    // Using max to prevent the shader compiler from wrecking the precision.
    // Othwewise the compiler could optimize the sum of the four terms into
    // some equivalent form that does premature rounding.
    float inf = 1.0 / uZero;
    float hi = max(splitValue[0] - domainStart[0], -inf);
    float lo = max(splitValue[1] - domainStart[1], -inf);

    return dot(vec4(start, hi, lo, bandwidth), vec4(1.0, step, step, band));
}
