import RasterProgram from "./programs/rasterProgram.js";

/** @type {typeof import("./raster.d.ts").rasterMark} */
export const rasterMark = Object.freeze({
    type: "raster",
    getProgramKey(config) {
        return JSON.stringify([
            Object.entries(config.data.cells).map(([name, data]) => [
                name,
                data.constructor.name,
            ]),
            /** @type {const} */ (["x0", "x1", "y0", "y1"]).map(
                (edge) => config.data.tiles[edge].constructor.name
            ),
            config.position?.x?.inputComponents,
            config.position?.x2?.inputComponents,
            config.position?.y?.inputComponents,
            config.position?.y2?.inputComponents,
            config.placement ?? !!config.data.tiles.placementIndices,
        ]);
    },
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
