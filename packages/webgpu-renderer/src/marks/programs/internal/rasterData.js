import { validateStorageBufferSize } from "../../../utils/bufferLimits.js";
import { fragmentInput } from "../../../types.js";

/**
 * @typedef {import("../../raster.js").RasterConfig} RasterConfig
 * @typedef {import("../../raster.js").RasterSeries} RasterSeries
 * @typedef {import("../../raster.js").RasterCellArray} RasterCellArray
 */

/** @type {readonly (readonly ["x" | "x2" | "y" | "y2", "x0" | "x1" | "y0" | "y1", "x" | "y"])[]} */
const edges = [
    ["x", "x0", "x"],
    ["x2", "x1", "x"],
    ["y", "y0", "y"],
    ["y2", "y1", "y"],
];

/**
 * @param {RasterCellArray} array
 * @returns {"f32" | "u32"}
 */
function numericType(array) {
    if (array instanceof Float32Array) return "f32";
    if (array instanceof Uint32Array) return "u32";
    throw new Error("Raster arrays must be Float32Array or Uint32Array.");
}

/**
 * Compile the snapshot schema, mapping arbitrary field names to private WGSL
 * identifiers and binding each field to its packed cell read.
 * @param {RasterConfig} config
 */
export function compileRasterData(config) {
    const { data, position } = config;
    const entries = Object.entries(data.cells);
    const fields = new Map(
        entries.map(([name, array], offset) => {
            const type = numericType(array);
            const word = `rasterCells[i * ${entries.length}u + ${offset}u]`;
            return [
                name,
                {
                    name: "cellField" + offset,
                    type,
                    [fragmentInput]:
                        type === "f32" ? `bitcast<f32>(${word})` : word,
                },
            ];
        })
    );
    if (position && ("x2" in position || "y2" in position)) {
        throw new Error("Raster endpoints share one position scale per axis.");
    }
    const positions = edges.map(([channel, edge, axis]) => {
        const descriptor = position?.[axis];
        const type = numericType(data.tiles[edge]);
        const components = descriptor?.inputComponents ?? 1;
        return { channel, edge, descriptor, type, components };
    });
    const perTilePlacement =
        !!config.placementIndex && "data" in config.placementIndex;
    const picking = data.tiles.pickingIds !== undefined;
    return { fields, positions, perTilePlacement, picking };
}

/** @typedef {ReturnType<typeof compileRasterData>} RasterSchema */

/**
 * @param {GPUDevice} device
 * @param {RasterSeries} data
 * @param {RasterSchema} schema
 */
export function prepareRasterData(
    device,
    { tiles, cells, placementIndex },
    schema
) {
    const { columns, rows, offsets, pickingIds } = tiles;
    const count = columns.length;
    if (
        schema.perTilePlacement !== (placementIndex !== undefined) ||
        schema.picking !== (pickingIds !== undefined)
    ) {
        throw new Error(
            "Raster data replacement must keep its placement indices and picking IDs."
        );
    }

    /** @type {Record<string, RasterCellArray>} */
    const series = { columns, rows, cellOffset: offsets };
    if (placementIndex !== undefined) series.__placementIndex = placementIndex;
    if (pickingIds !== undefined) series.tilePickingId = pickingIds;
    if (
        Object.values(series).some(
            (array) => !(array instanceof Uint32Array) || array.length !== count
        )
    ) {
        throw new Error(
            "Raster tile metadata must use Uint32Array columns of equal length."
        );
    }
    for (const { channel, edge, type, components } of schema.positions) {
        const array = tiles[edge];
        if (
            !array ||
            numericType(array) !== type ||
            array.length !== count * components
        ) {
            throw new Error(
                `Raster position "${edge}" must keep its input type and match the tile count.`
            );
        }
        series[channel] = array;
    }

    if (Object.keys(cells).length !== schema.fields.size) {
        throw new Error(
            "Raster data replacement must keep the original cell fields."
        );
    }
    const arrays = Array.from(schema.fields, ([name, { type }]) => {
        if (!Object.hasOwn(cells, name) || numericType(cells[name]) !== type) {
            throw new Error(
                `Raster cell field "${name}" must keep its original type.`
            );
        }
        return cells[name];
    });
    const length = arrays[0]?.length ?? 0;
    if (arrays.some((array) => array.length !== length)) {
        throw new Error("Raster cell fields must have equal lengths.");
    }
    for (let tile = 0; tile < count; tile++) {
        const end = offsets[tile] + columns[tile] * rows[tile];
        if (
            !columns[tile] ||
            !rows[tile] ||
            !Number.isSafeInteger(end) ||
            (arrays.length && end > length) ||
            end > 0x100000000
        ) {
            throw new Error(
                `Raster tile ${tile} has invalid dimensions or cell offset.`
            );
        }
    }
    validateStorageBufferSize(
        device,
        Math.max(4, length * arrays.length * 4),
        "Raster cells"
    );

    const words = arrays.map(
        (array) => new Uint32Array(array.buffer, array.byteOffset, array.length)
    );
    if (words.length <= 1)
        return { count, series, cells: words[0] ?? new Uint32Array(0) };
    // Interleave fields to use one storage binding regardless of field count.
    const packed = new Uint32Array(length * words.length);
    for (const [offset, field] of words.entries()) {
        for (let i = 0; i < length; i++) {
            packed[i * words.length + offset] = field[i];
        }
    }
    return { count, series, cells: packed };
}

/**
 * @param {RasterConfig} config
 * @param {RasterSchema} schema
 * @param {ReturnType<typeof prepareRasterData>} prepared
 */
export function lowerRasterConfig(config, schema, prepared) {
    /**
     * @param {import("../../raster.js").RasterCellChannel} channel
     * @returns {import("../../../index.d.ts").ChannelConfigInput & {[fragmentInput]?: string}}
     */
    function lowerValue(channel) {
        if ("input" in channel) {
            const field = schema.fields.get(channel.input);
            if (!field) {
                throw new Error(
                    `Unknown raster cell field "${channel.input}".`
                );
            }
            return {
                type: field.type,
                [fragmentInput]: field[fragmentInput],
                inputComponents: /** @type {const} */ (1),
                scale: channel.scale,
            };
        }
        return { value: channel.value, dynamic: channel.dynamic };
    }

    /**
     * @param {import("../../raster.js").RasterCellChannel} channel
     * @returns {import("../../../index.d.ts").ChannelConfigInput}
     */
    function lowerChannel(channel) {
        return {
            ...lowerValue(channel),
            conditions: channel.conditions?.map((condition) =>
                "channel" in condition
                    ? { ...condition, channel: lowerValue(condition.channel) }
                    : condition
            ),
        };
    }

    const { channels, visibleWhen, order } = config;
    /** @type {Record<string, import("../../../index.d.ts").ScalarInputConfig | import("../../../types.js").FragmentInput>} */
    const inputs = Object.fromEntries(
        Array.from(schema.fields.values(), ({ name, ...input }) => [
            name,
            input,
        ])
    );
    for (const name of ["columns", "rows", "cellOffset"]) {
        inputs[name] = { data: prepared.series[name], type: "u32" };
    }
    if (schema.picking) {
        inputs.tilePickingId = {
            data: prepared.series.tilePickingId,
            type: "u32",
        };
    }
    const fill = channels?.fill;
    return {
        count: prepared.count,
        picking: schema.picking,
        projection: config.projection,
        initialCells: prepared.cells,
        inputs,
        cellPredicates: {
            fields: schema.fields,
            position: (/** @type {"x" | "y"} */ axis) => ({
                value: `rasterCoordinate_${axis}(0u)`,
                secondary: `rasterCoordinate_${axis}(1u)`,
                readPackedBound: (/** @type {string} */ field) =>
                    `vec2<u32>(${field}.x, 2u * ${field}.y)`,
            }),
        },
        visibleWhen,
        order,
        placementIndex: config.placementIndex,
        channels: {
            ...Object.fromEntries(
                schema.positions.map(({ channel, descriptor, type }) => [
                    channel,
                    {
                        ...descriptor,
                        band: channel.endsWith("2")
                            ? (descriptor?.bandEnd ?? descriptor?.band)
                            : descriptor?.band,
                        type,
                        data: prepared.series[channel],
                    },
                ])
            ),
            ...(fill && { fill: lowerChannel(fill) }),
            ...(channels?.opacity && {
                opacity: lowerChannel(channels.opacity),
            }),
        },
    };
}
