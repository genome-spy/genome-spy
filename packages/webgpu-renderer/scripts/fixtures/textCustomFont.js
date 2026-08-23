import { textMark } from "@genome-spy/webgpu-renderer/marks/text";

const customFontResource = Object.freeze({
    // The resource is supplied by the host in this fixture; its metrics are
    // intentionally opaque to the renderer package's public API.
    metrics: {},
    bitmap: "custom-font-atlas.png",
});

export const customFontTextConfig = Object.freeze({
    channels: {},
    font: "Custom Sans",
    fontResource: customFontResource,
});

export function createCustomFontProgram(renderer) {
    return textMark.createProgram(renderer, customFontTextConfig);
}
