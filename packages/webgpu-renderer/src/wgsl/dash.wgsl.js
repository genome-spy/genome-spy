const DASH_WGSL = /* wgsl */ `
// dashAtlas.js stores two biased, little-endian interval endpoints per texel.
fn decodeDashInterval(packed: vec4<u32>) -> vec2<f32> {
    return vec2<f32>(f32(packed.x + 256u * packed.y),
        f32(packed.z + 256u * packed.w)) - 256.0;
}
`;

export default DASH_WGSL;
