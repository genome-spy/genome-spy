/** @type {Record<string, import("../utils/channelSpecUtils.js").ChannelSpec>} */
export const POSITION_CLAMP_CHANNEL_SPECS = {
    xClampRange: { type: "f32", components: 2, optional: true },
    yClampRange: { type: "f32", components: 2, optional: true },
};

export const POSITION_CLAMP_WGSL = /* wgsl */ `
fn clampPlacedPosition(position: vec2<f32>, i: u32) -> vec2<f32> {
    var result = position;
#if defined(xClampRange_DEFINED)
    let xBounds = getScaled_xClampRange(i);
    let xMin = applyPlacementPixel(vec2<f32>(xBounds.x, 0.0), i).x;
    let xMax = applyPlacementPixel(vec2<f32>(xBounds.y, 0.0), i).x;
    result.x = clamp(result.x, xMin, xMax);
#endif
#if defined(yClampRange_DEFINED)
    let yBounds = getScaled_yClampRange(i);
    let yMin = applyPlacementPixel(vec2<f32>(0.0, yBounds.x), i).y;
    let yMax = applyPlacementPixel(vec2<f32>(0.0, yBounds.y), i).y;
    result.y = clamp(result.y, yMin, yMax);
#endif
    return result;
}

// Project anchors before constructing geometry so pixel offsets and strokes
// retain their size in both smaller and larger placements.
fn projectClampedPosition(position: vec2<f32>, offset: vec2<f32>, i: u32) -> vec2<f32> {
    return clampPlacedPosition(applyPlacementPixel(position, i) + offset, i);
}
`;
