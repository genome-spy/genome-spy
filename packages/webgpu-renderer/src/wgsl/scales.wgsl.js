export default /* wgsl */ `
const uZero: f32 = 0.0;

// These scale helpers are a WGSL port of the GLSL versions in
// packages/core/src/gl/includes/scales.glsl. Comments are preserved
// to keep behavior aligned across render backends.

// Utils ------------

fn getDiscreteColor(s: texture_2d<f32>, index: i32) -> vec3<f32> {
    let size = textureDimensions(s).x;
    let ix = i32(u32(index) % size);
    return textureLoad(s, vec2<i32>(ix, 0), 0).rgb;
}

fn getInterpolatedColor(s: texture_2d<f32>, samp: sampler, unitValue: f32) -> vec3<f32> {
    return textureSampleLevel(s, samp, vec2<f32>(unitValue, 0.0), 0.0).rgb;
}

fn clampToRange(value: f32, range: vec2<f32>) -> f32 {
    return clamp(value, min(range.x, range.y), max(range.x, range.y));
}

fn clampToDomain(value: f32, domain: vec2<f32>) -> f32 {
    return clamp(value, min(domain.x, domain.y), max(domain.x, domain.y));
}

// Uniform arrays must use 16-byte elements, so scalar pairs are packed into vec4 slots.
fn readPacked2(values: array<vec4<f32>, 2>) -> vec2<f32> {
    return vec2<f32>(values[0].x, values[1].x);
}

// Scales ------------
// Based on d3 scales: https://github.com/d3/d3-scale

fn scaleIdentity(value: f32) -> f32 {
    return value;
}

fn scaleIdentityU(value: u32) -> f32 {
    return f32(value);
}

fn scaleLinear(value: f32, domain: vec2<f32>, range: vec2<f32>) -> f32 {
    let domainSpan = domain.y - domain.x;
    let rangeSpan = range.y - range.x;
    return (value - domain.x) / domainSpan * rangeSpan + range.x;
}

fn scaleLog(value: f32, domain: vec2<f32>, range: vec2<f32>, base: f32) -> f32 {
    // y = m log(x) + b
    // TODO: Perf optimization: precalculate log domain in js.
    // TODO: Reversed domain, etc
    return scaleLinear(log(value) / log(base), log(domain) / log(base), range);
}

fn symlog(value: f32, constant: f32) -> f32 {
    // WARNING: emulating log1p with log(x + 1). Small numbers are likely to
    // have significant precision problems.
    return sign(value) * log(abs(value / constant) + 1.0);
}

fn scaleSymlog(value: f32, domain: vec2<f32>, range: vec2<f32>, constant: f32) -> f32 {
    return scaleLinear(
        symlog(value, constant),
        vec2<f32>(symlog(domain.x, constant), symlog(domain.y, constant)),
        range
    );
}

fn scalePow(value: f32, domain: vec2<f32>, range: vec2<f32>, exponent: f32) -> f32 {
    // y = mx^k + b
    // TODO: Perf optimization: precalculate pow domain in js.
    // TODO: Reversed domain, etc
    return scaleLinear(
        pow(abs(value), exponent) * sign(value),
        pow(abs(domain), vec2<f32>(exponent)) * sign(domain),
        range
    );
}

// TODO: scaleThreshold
// TODO: scaleQuantile (special case of threshold scale)

// TODO: domainExtent should be uint
fn scaleBand(value: u32, domainExtent: vec2<f32>, range: vec2<f32>,
        paddingInner: f32, paddingOuter: f32,
        align: f32, band: f32) -> f32 {

    // TODO: reverse
    var start = range.x;
    let stop = range.y;
    let rangeSpan = stop - start;

    let n = domainExtent.y - domainExtent.x;

    // This fix departs from Vega and d3: https://github.com/vega/vega/issues/3357#issuecomment-1063253596
    let paddingInnerAdjusted = select(paddingInner, 0.0, i32(n) <= 1);

    // Adapted from: https://github.com/d3/d3-scale/blob/master/src/band.js
    let step = rangeSpan / max(1.0, n - paddingInnerAdjusted + paddingOuter * 2.0);
    start += (rangeSpan - step * (n - paddingInnerAdjusted)) * align;
    let bandwidth = step * (1.0 - paddingInnerAdjusted);

    return start + (f32(value) - domainExtent.x) * step + bandwidth * band;
}

const lowBits: i32 = 12;
const lowDivisor: f32 = pow(2.0, f32(lowBits));
const lowMask: u32 = u32(lowDivisor - 1.0);

fn splitUint(value: u32) -> vec2<f32> {
    let valueLo = value & lowMask;
    let valueHi = value - valueLo;
    return vec2<f32>(f32(valueHi), f32(valueLo));
}

/**
 * High precision variant of scaleBand for index/locus scales
 */
fn scaleBandHp(value: u32, domainExtent: vec3<f32>, range: vec2<f32>,
        paddingInner: f32, paddingOuter: f32,
        align: f32, band: f32) -> f32 {

    // TODO: reverse
    var start = range.x;
    let stop = range.y;
    let rangeSpan = stop - start;

    let domainStart = domainExtent.xy;
    let n = domainExtent.z;

    // The following computation is identical for every vertex. Could be done on the JS side.
    let step = rangeSpan / max(1.0, n - paddingInner + paddingOuter * 2.0);
    start += (rangeSpan - step * (n - paddingInner)) * align;
    let bandwidth = step * (1.0 - paddingInner);

    // Split into to values with each having a reduced number of significant digits
    // to mitigate the lack of precision in float32 calculations.
    let splitValue = splitUint(value);

    // Using max to prevent the shader compiler from wrecking the precision.
    // Othwewise the compiler could optimize the sum of the four terms into
    // some equivalent form that does premature rounding.
    // WGSL does not allow generating infinity via division by zero.
    let hi = splitValue.x - domainStart.x;
    let lo = splitValue.y - domainStart.y;

    return dot(vec4<f32>(start, hi, lo, bandwidth), vec4<f32>(1.0, step, step, band));
}

/**
 * High precision variant of scaleBand for index/locus scales for large
 * domains where 32bit uints are not sufficient to represent the domain.
 */
fn scaleBandHpU(value: vec2<u32>, domainExtent: vec3<f32>, range: vec2<f32>,
                paddingInner: f32, paddingOuter: f32,
                align: f32, band: f32) -> f32 {

    // TODO: reverse
    var start = range.x;
    let stop = range.y;
    let rangeSpan = stop - start;

    let domainStart = domainExtent.xy;
    let n = domainExtent.z;

    // The following computation is identical for every vertex. Could be done on the JS side.
    let step = rangeSpan / max(1.0, n - paddingInner + paddingOuter * 2.0);
    start += (rangeSpan - step * (n - paddingInner)) * align;
    let bandwidth = step * (1.0 - paddingInner);

    // Split into to values with each having a reduced number of significant digits
    // to mitigate the lack of precision in float32 calculations.
    let splitValue = vec2<f32>(f32(value.x) * lowDivisor, f32(value.y));

    // Using max to prevent the shader compiler from wrecking the precision.
    // Othwewise the compiler could optimize the sum of the four terms into
    // some equivalent form that does premature rounding.
    // WGSL does not allow generating infinity via division by zero.
    let hi = splitValue.x - domainStart.x;
    let lo = splitValue.y - domainStart.y;

    return dot(vec4<f32>(start, hi, lo, bandwidth), vec4<f32>(1.0, step, step, band));
}
`;
