import RasterProgram from "./programs/rasterProgram.js";

/** @param {import("./raster.d.ts").RasterConfig} config */
function validateCellOpacity({ cells, channels: { cellOpacity } }) {
    if (!cellOpacity) return;
    const isScalar = (
        /** @type {import("../index.js").ChannelConfigInput} */ input
    ) => typeof input.value === "number" && !input.data && !input.scale;
    if (!isScalar(cellOpacity)) {
        throw new Error("Raster cell opacity requires a scalar value.");
    }
    const conditions = cellOpacity.conditions;
    if (!conditions) return;
    const [condition] = conditions;
    const when = condition?.when;
    const projection = when?.projections?.[0];
    if (
        !(cells instanceof Float32Array) ||
        conditions.length !== 1 ||
        when?.type !== "interval" ||
        when.projections?.length !== 1 ||
        projection?.input !== "fill" ||
        projection.secondaryInput !== undefined ||
        !(condition.channel
            ? isScalar(condition.channel)
            : typeof condition.value === "number")
    ) {
        throw new Error(
            "Conditional raster cell opacity requires scalar values and one interval projected onto float32 fill cells."
        );
    }
}

/** @type {typeof import("./raster.d.ts").rasterMark} */
export const rasterMark = Object.freeze({
    type: "raster",
    getProgramKey: (config) => config.cells.constructor,
    createProgram(renderer, config, context) {
        validateCellOpacity(config);
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
