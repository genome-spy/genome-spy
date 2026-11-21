import { validateStorageBufferSize } from "../../../utils/bufferLimits.js";

/**
 * @typedef {import("../../raster.js").RasterConfig} RasterConfig
 * @typedef {import("../../raster.js").RasterData} RasterData
 * @typedef {import("../../raster.js").RasterCellArray} RasterCellArray
 * @typedef {import("../../../index.d.ts").VisibilityPredicate} VisibilityPredicate
 */

/** @type {readonly (readonly ["x" | "x2" | "y" | "y2", "x0" | "x1" | "y0" | "y1", "x" | "y"])[]} */
const edges = [
    ["x", "x0", "x"],
    ["x2", "x1", "x"],
    ["y", "y0", "y"],
    ["y2", "y1", "y"],
];

const anchors = /** @type {const} */ ([
    ["x", "x0", "x"],
    ["y", "y0", "y"],
    ["size", "size", "size"],
]);

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
 * identifiers. Empty typed arrays identify fragment sources during ordinary
 * channel validation, without adding them to the packed tile series.
 * @param {RasterConfig} config
 */
export function compileRasterData(config) {
    const { data, position } = config;
    const fields = new Map(
        Object.entries(data.cells).map(([name, array], offset) => {
            const type = numericType(array);
            const data =
                type === "u32" ? new Uint32Array(0) : new Float32Array(0);
            return [name, { name: "cellField" + offset, type, data, offset }];
        })
    );
    /** @type {Map<RasterCellArray, string>} */
    const reads = new Map(
        Array.from(fields.values(), ({ data, type, offset }) => {
            const word = `rasterCells[i * ${fields.size}u + ${offset}u]`;
            return [data, type === "f32" ? `bitcast<f32>(${word})` : word];
        })
    );
    const icon = data.tiles.x1 === undefined && data.tiles.y1 === undefined;
    if (
        (data.tiles.x1 === undefined) !== (data.tiles.y1 === undefined) ||
        (icon && config.projection === "triangle") ||
        (icon
            ? position?.x2 || position?.y2
            : position?.size || data.tiles.size)
    ) {
        throw new Error(
            "Raster placement requires either two endpoints per axis or an anchor and optional size."
        );
    }
    const positions = (icon ? anchors : edges).map(([channel, edge, axis]) => {
        /** @type {import("../../raster.js").RasterAnchor | undefined} */
        const descriptor = position?.[channel] ?? position?.[axis];
        const array = data.tiles[edge];
        const value = descriptor && "value" in descriptor;
        if (
            (value && (array || !icon)) ||
            (!array && !value && channel !== "size")
        ) {
            throw new Error(
                `Raster position "${channel}" requires a single input.`
            );
        }
        const type = array === undefined ? undefined : numericType(array);
        const components = descriptor?.inputComponents ?? 1;
        return { channel, edge, descriptor, type, components };
    });
    const placementIndices = data.tiles.placementIndices !== undefined;
    if (placementIndices && config.placement) {
        throw new Error(
            "Raster placement must come from either the draw or the tiles."
        );
    }
    return { fields, reads, positions, placementIndices, icon };
}

/** @typedef {ReturnType<typeof compileRasterData>} RasterSchema */

/**
 * @param {GPUDevice} device
 * @param {RasterData} data
 * @param {RasterSchema} schema
 */
export function prepareRasterData(device, { tiles, cells }, schema) {
    const { columns, rows, offsets, placementIndices } = tiles;
    const count = columns.length;
    if (
        (schema.icon && (tiles.x1 !== undefined || tiles.y1 !== undefined)) ||
        (!schema.icon && tiles.size !== undefined)
    ) {
        throw new Error(
            "Raster data replacement must keep the original placement mode."
        );
    }
    if (
        !(
            columns instanceof Uint32Array &&
            rows instanceof Uint32Array &&
            offsets instanceof Uint32Array &&
            rows.length === count &&
            offsets.length === count
        ) ||
        schema.placementIndices !== (placementIndices !== undefined) ||
        (placementIndices !== undefined &&
            (!(placementIndices instanceof Uint32Array) ||
                placementIndices.length !== count))
    ) {
        throw new Error(
            "Raster tile metadata must use Uint32Array columns of equal length."
        );
    }

    /** @type {Record<string, RasterCellArray>} */
    const series = { columns, rows, cellOffset: offsets };
    if (placementIndices) series.__placementIndex = placementIndices;
    for (const { channel, edge, type, components } of schema.positions) {
        const array = tiles[edge];
        const inputType = array === undefined ? undefined : numericType(array);
        if (
            inputType !== type ||
            (array && array.length !== count * components)
        ) {
            throw new Error(
                `Raster position "${edge}" must keep its input type and match the tile count.`
            );
        }
        if (array) series[channel] = array;
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
    /** @param {string} name */
    const field = (name) => {
        const binding = schema.fields.get(name);
        if (!binding) throw new Error(`Unknown raster cell field "${name}".`);
        return binding;
    };

    /** @param {import("../../../index.d.ts").ScalarOperand} operand */
    const lowerOperand = (operand) => {
        if ("input" in operand) return { input: field(operand.input).name };
        if (
            "channel" in operand &&
            !["fill", "opacity"].includes(operand.channel)
        ) {
            throw new Error(
                `Raster visibility cannot compare tile channel "${operand.channel}".`
            );
        }
        return operand;
    };

    /**
     * @param {VisibilityPredicate} node
     * @returns {VisibilityPredicate}
     */
    function lowerPredicate(node) {
        if ("all" in node) return { all: node.all.map(lowerPredicate) };
        if ("any" in node) return { any: node.any.map(lowerPredicate) };
        if ("not" in node) return { not: lowerPredicate(node.not) };
        if ("compare" in node) {
            return {
                ...node,
                left: lowerOperand(node.left),
                right: lowerOperand(node.right),
            };
        }
        if ("selectionActive" in node) return node;
        if (node.type === "multi") {
            return { ...node, input: field(node.input ?? "uniqueId").name };
        }
        if (node.type === "interval") {
            return {
                ...node,
                projections: /** @type {typeof node.projections} */ (
                    /** @type {unknown} */ (
                        node.projections.map((projection) => {
                            const input = field(projection.input);
                            if (
                                input.type !== "f32" ||
                                projection.secondaryInput !== undefined
                            ) {
                                throw new Error(
                                    "Raster interval projections require a single Float32Array cell field."
                                );
                            }
                            return { ...projection, input: input.name };
                        })
                    )
                ),
            };
        }
        throw new Error(
            "Raster cells do not support single-ID selection membership."
        );
    }

    /**
     * @param {import("../../raster.js").RasterCellChannel} channel
     * @returns {import("../../../index.d.ts").ChannelConfigInput}
     */
    function lowerValue(channel) {
        if ("input" in channel) {
            const { data, type } = field(channel.input);
            return {
                data,
                type,
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
            conditions: channel.conditions?.map((condition) => ({
                when: /** @type {import("../../../index.d.ts").SelectionPredicate} */ (
                    lowerPredicate(condition.when)
                ),
                ...("channel" in condition
                    ? { channel: lowerValue(condition.channel) }
                    : { value: condition.value }),
            })),
        };
    }

    const { channels, visibleWhen, order, scalarSlots } = config;
    /** @type {Record<string, import("../../../index.d.ts").ScalarInputConfig>} */
    const inputs = Object.fromEntries(
        Array.from(schema.fields.values(), ({ name, type, data }) => [
            name,
            { type, data },
        ])
    );
    for (const name of ["columns", "rows", "cellOffset"]) {
        inputs[name] = { data: prepared.series[name], type: "u32" };
    }
    const fill = channels?.fill;
    return {
        count: prepared.count,
        icon: schema.icon,
        triangle: config.projection === "triangle",
        reads: schema.reads,
        initialCells: prepared.cells,
        scalarSlots,
        inputs,
        visibleWhen: visibleWhen && lowerPredicate(visibleWhen),
        order: order && { ...order, when: lowerPredicate(order.when) },
        placementIndex: config.placement
            ? { source: "draw" }
            : schema.placementIndices
              ? { data: prepared.series.__placementIndex, type: "u32" }
              : undefined,
        channels: {
            ...Object.fromEntries(
                schema.positions.map(({ channel, descriptor, type }) => [
                    channel,
                    {
                        ...descriptor,
                        ...(type && { type, data: prepared.series[channel] }),
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
