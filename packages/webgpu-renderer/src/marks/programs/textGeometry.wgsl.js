export const TEXT_GEOMETRY_WGSL = /* wgsl */ `
const BASELINE_ALPHABETIC: u32 = 0u;
const BASELINE_MIDDLE: u32 = 1u;
const BASELINE_TOP: u32 = 2u;
const BASELINE_BOTTOM: u32 = 3u;

fn baselineOffset(
    baseline: u32,
    sdfPadding: f32,
    capHeight: f32,
    descent: f32
) -> f32 {
    var offset = -sdfPadding;
    if (baseline == BASELINE_TOP) {
        offset = offset + capHeight;
    } else if (baseline == BASELINE_MIDDLE) {
        offset = offset + capHeight * 0.5;
    } else if (baseline == BASELINE_BOTTOM) {
        offset = offset - descent;
    }
    return offset;
}

// BMFont y offsets and line offsets use a baseline-origin, y-up coordinate
// system. Convert them to top-origin pixel coordinates while positioning the
// atlas quad from top (vertexY = 0) to bottom (vertexY = 1).
fn glyphVertexY(
    vertexY: f32,
    lineYOffset: f32,
    glyphHeight: f32,
    glyphYOffset: f32,
    sizeScale: f32,
    sizeRatio: f32,
    baseline: u32,
    sdfPadding: f32,
    capHeight: f32,
    descent: f32
) -> f32 {
    let baselineY = baselineOffset(
        baseline,
        sdfPadding,
        capHeight,
        descent
    );
    return -lineYOffset * sizeRatio +
        (glyphYOffset + baselineY + vertexY * glyphHeight) * sizeScale;
}
`;
