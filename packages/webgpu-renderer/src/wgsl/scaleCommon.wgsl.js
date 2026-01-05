export default /* wgsl */ `

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

// Matches d3 rangeRound: rounds .5 away from zero.
fn roundAwayFromZero(value: f32) -> f32 {
    return select(ceil(value - 0.5), floor(value + 0.5), value >= 0.0);
}

// Uniform arrays must use 16-byte elements, so scalar pairs are packed into vec4 slots.
fn readPacked2(values: array<vec4<f32>, 2>) -> vec2<f32> {
    return vec2<f32>(values[0].x, values[1].x);
}

fn readPacked3(values: array<vec4<f32>, 3>) -> vec3<f32> {
    return vec3<f32>(values[0].x, values[1].x, values[2].x);
}

// Using max to prevent the shader compiler from wrecking the precision.
// Otherwise the compiler could optimize the expression into a form that
// does premature rounding. globals.uZero is a uniform (always 0.0) to
// keep the division from constant folding.
fn stableSub(a: f32, b: f32) -> f32 {
    let inf = 1.0 / globals.uZero;
    return max(a - b, -inf);
}
`;
