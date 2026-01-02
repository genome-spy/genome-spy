const DASH_WGSL = /* wgsl */ `
fn dashMask(atlas: texture_2d<u32>, patternIndex: u32, distancePx: f32, strokeWidth: f32, dashOffset: f32) -> f32 {
    if (params.uDashPatternCount == 0u) {
        return 1.0;
    }
    if (patternIndex >= params.uDashPatternCount) {
        return 1.0;
    }

    let lenUnits = textureLoad(atlas, vec2<i32>(0, i32(patternIndex)), 0).x;
    if (lenUnits == 0u) {
        return 1.0;
    }

    let lenPx = f32(lenUnits) * strokeWidth;
    if (lenPx <= 0.0) {
        return 1.0;
    }

    let t = distancePx + dashOffset * strokeWidth;
    let u = fract(t / lenPx);
    let idx = 1u + u32(floor(u * f32(lenUnits)));
    let width = u32(textureDimensions(atlas).x);
    if (idx >= width) {
        return 1.0;
    }

    let sample = textureLoad(atlas, vec2<i32>(i32(idx), i32(patternIndex)), 0).x;
    return f32(sample) / 255.0;
}
`;

export default DASH_WGSL;
