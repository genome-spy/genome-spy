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
            /** @type {const} */ (["x0", "x1", "y0", "y1"]).map(
                (key) => config.data.tiles[key]?.constructor.name
            ),
            /** @type {const} */ (["x", "y"]).map((name) => {
                const { inputComponents, bandEnd } =
                    config.position?.[name] ?? {};
                return [inputComponents, bandEnd];
            }),
            config.placementIndex &&
                ("source" in config.placementIndex ? "draw" : "series"),
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
