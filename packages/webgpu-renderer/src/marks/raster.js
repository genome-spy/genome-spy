import RasterProgram from "./programs/rasterProgram.js";

/** @type {typeof import("./raster.d.ts").rasterMark} */
export const rasterMark = Object.freeze({
    type: "raster",
    getProgramKey: (config) => config.cells.constructor,
    createProgram(renderer, config, context) {
        const fillType = config.cells instanceof Uint32Array ? "u32" : "f32";
        return new RasterProgram(
            /** @type {import("../renderer.js").Renderer} */ (
                /** @type {unknown} */ (renderer)
            ),
            {
                ...config,
                channels: {
                    ...config.channels,
                    // The cell buffer supplies the actual fragment value.
                    fill: {
                        scale: config.channels.fill.scale,
                        value: 0,
                        type: fillType,
                    },
                },
            },
            context
        );
    },
});
