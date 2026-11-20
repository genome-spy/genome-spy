import RasterProgram from "./programs/rasterProgram.js";

/** @type {typeof import("./raster.d.ts").rasterMark} */
export const rasterMark = Object.freeze({
    type: "raster",
    createProgram(renderer, config, context) {
        return new RasterProgram(
            /** @type {import("../renderer.js").Renderer} */ (
                /** @type {unknown} */ (renderer)
            ),
            config,
            context
        );
    },
});
