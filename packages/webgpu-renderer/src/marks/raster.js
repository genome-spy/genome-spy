import RasterProgram from "./programs/rasterProgram.js";

/** @type {typeof import("./raster.d.ts").rasterMark} */
export const rasterMark = Object.freeze({
    type: "raster",
    getProgramKey(config) {
        return JSON.stringify([
            config.projection,
            !!config.data.tiles.pickingIds,
            Object.entries(config.data.cells).map(([name, data]) => [
                name,
                data.constructor.name,
            ]),
            /** @type {const} */ (["x0", "x1", "y0", "y1", "size"]).map(
                (key) => config.data.tiles[key]?.constructor.name
            ),
            /** @type {const} */ (["x", "x2", "y", "y2", "size"]).map(
                (name) => {
                    const descriptor =
                        /** @type {import("./raster.d.ts").RasterAnchor | undefined} */ (
                            config.position?.[name]
                        );
                    return [
                        descriptor?.inputComponents,
                        descriptor?.type,
                        descriptor?.dynamic,
                    ];
                }
            ),
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
