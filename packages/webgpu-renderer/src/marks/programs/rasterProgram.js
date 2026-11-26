import { SCALE_BAND_PREFIX } from "../../wgsl/prefixes.js";
import { hasGroupingGaps } from "../scales/groupingGaps.js";
import {
    bandParameters,
    domainVec3,
    rangeVec2,
} from "../scales/scaleEmitUtils.js";
import BaseProgram from "./internal/baseProgram.js";
import {
    compileRasterData,
    lowerRasterConfig,
    prepareRasterData,
} from "./internal/rasterData.js";

/** @type {Record<string, import("../utils/channelSpecUtils.js").ChannelSpec>} */
const channels = {
    x: { type: "f32", components: 1, default: 0 },
    x2: { type: "f32", components: 1, default: 1 },
    y: { type: "f32", components: 1, default: 0 },
    y2: { type: "f32", components: 1, default: 1 },
    fill: { type: "f32", components: 4, default: [0, 0, 0, 1] },
    opacity: { type: "f32", components: 1, default: 1 },
};

/**
 * Generate source-space anchor projection for an unpadded index axis.
 * Other mappings interpolate between the projected edges.
 *
 * @param {import("../shaders/channelIR.js").ChannelIR[]} irs
 * @param {"x" | "y"} axis
 * @param {"x" | "y"} [screenAxis]
 */
function indexAxisShader(irs, axis, screenAxis = axis) {
    const first = irs.find(({ name }) => name === axis);
    if (first.scaleType !== "index" || hasGroupingGaps(first.channel.scale)) {
        return "";
    }
    const { sharedScaleName, inputComponents } = first;
    /** @param {string} name */
    const key = (name) => {
        const read = `read_${name}(i)`;
        return inputComponents === 2 ? read : `rasterIndexKey(${read})`;
    };
    const position =
        screenAxis === "x" ? "vec2<f32>(p, 0.0)" : "vec2<f32>(0.0, p)";
    return /* wgsl */ `
fn anchor_${axis}(i: u32, count: u32, anchor: u32, fallback: f32) -> f32 {
    let domain = ${domainVec3(axis, sharedScaleName)};
    let range = ${rangeVec2(axis, sharedScaleName)};
    if (domain.z < 1.0 || any(vec3<f32>(${bandParameters(axis, sharedScaleName)}).xy != vec2<f32>(0.0))) {
        return fallback;
    }

    let p = projectRasterAnchor(${key(axis)}, ${key(axis + "2")}, count, anchor,
        vec2<f32>(params.${SCALE_BAND_PREFIX}${axis}, params.${SCALE_BAND_PREFIX}${axis}2), domain, range);
    return rasterTargetPixel(applyPlacementPixel(${position}, i)).${screenAxis};
}
`;
}

/**
 * @param {import("../shaders/channelIR.js").ChannelIR[]} irs
 * @param {unknown} projection
 * @param {boolean} picking
 * @param {ReadonlySet<"x" | "y">} coordinates
 */
function rasterShader(irs, projection, picking, coordinates) {
    const down = projection === "triangle-down";
    const triangle = projection === "triangle" || down;
    const x = indexAxisShader(irs, "x");
    const y = indexAxisShader(irs, "y", triangle ? "x" : "y");
    const coordinateFields = [];
    const copyCoordinates = [];
    const coordinatePrograms = [];
    const useCoordinates = [];
    for (const axis of coordinates) {
        const field = `bounds_${axis}`;
        const start = irs.find((ir) => ir.name === axis);
        const packed = start.inputComponents === 2;
        const type = packed ? "vec2<u32>" : "f32";
        const boundsType = packed ? "vec4<u32>" : "vec2<f32>";
        const first = packed
            ? start.rawValueExpr
            : `f32(${start.rawValueExpr})`;
        const location = axis === "x" ? 7 : 8;
        coordinateFields.push(
            `@location(${location}) @interpolate(flat) ${field}: ${boundsType},`
        );
        useCoordinates.push(`raster_${field} = in.${field};`);
        const last = irs.find((ir) => ir.name === axis + "2").rawValueExpr;
        copyCoordinates.push(
            `out.${field} = ${boundsType}(${first}, ${packed ? last : `f32(${last})`});`
        );
        const bounds = `raster_${field}`;
        const cell = `rasterCell.${axis} + edge`;
        const count = `rasterShape.${axis}`;
        const value = packed
            ? `rasterGridKey(${bounds}.xy, ${bounds}.zw, ${count}, ${cell})`
            : `mix(${bounds}.x, ${bounds}.y, f32(${cell}) / f32(${count}))`;
        coordinatePrograms.push(/* wgsl */ `
var<private> raster_${field}: ${boundsType};
fn rasterCoordinate_${axis}(edge: u32) -> ${type} {
    return ${value};
}
`);
    }
    const bounds = triangle
        ? /* wgsl */ `
    let start = vec2<f32>(
        rasterHorizontal(i, getScaled_x(i)), rasterHorizontal(i, getScaled_y(i))
    );
    let end = vec2<f32>(
        rasterHorizontal(i, getScaled_x2(i)), rasterHorizontal(i, getScaled_y2(i))
    );
    let topLeft = rasterTargetPixel(applyPlacementPixel(vec2<f32>(0.0), i));
    let bottomRight = rasterTargetPixel(applyPlacementPixel(vec2<f32>(globals.width, globals.height), i));
    out.triangleClip = vec4<f32>(max(topLeft, vec2<f32>(0.0)), min(bottomRight, targetSize));
    if (any(out.triangleClip.xy >= out.triangleClip.zw)) {
        out.pos = vec4<f32>(2.0, 2.0, 0.0, 1.0);
        return out;
    }
    out.triangle = vec2<f32>(${down ? "topLeft.y" : "bottomRight.y"},
        ${down ? "-" : ""}select(-1.0, 1.0, start.x < end.x));
    let vertical = (out.triangleClip.yw - out.triangle.x) * out.triangle.y;
    let lo = min(vertical.x, vertical.y);
    let hi = max(vertical.x, vertical.y);
    let sourceMin = out.triangleClip.x + vec2<f32>(lo, -hi);
    let sourceMax = out.triangleClip.z + vec2<f32>(hi, -lo);
`
        : /* wgsl */ `
    let start = rasterTargetPixel(applyPlacementPixel(vec2<f32>(getScaled_x(i), getScaled_y(i)), i));
    let end = rasterTargetPixel(applyPlacementPixel(vec2<f32>(getScaled_x2(i), getScaled_y2(i)), i));
`;
    return /* wgsl */ `
fn rasterTargetPixel(pixel: vec2<f32>) -> vec2<f32> {
    return (globals.viewportOrigin - globals.renderTargetOrigin + pixel) * globals.dpr;
}
${
    triangle
        ? /* wgsl */ `
fn rasterHorizontal(i: u32, position: f32) -> f32 {
    return rasterTargetPixel(applyPlacementPixel(vec2<f32>(position, 0.0), i)).x;
}
`
        : ""
}

fn rasterIndexKey(value: u32) -> vec2<u32> {
    return vec2<u32>(value >> 12u, value & 4095u);
}
struct RasterGridEdge {
    high: u32,
    low: f32,
    selectionLow: u32,
};

// Interpolate the integer cell boundary in packed coordinates. Doing the
// coarse division before the multiplication keeps the residual local even for
// tiles wider than u32. The residual product is exact for common tile sizes.
fn rasterGridEdge(first: vec2<u32>, last: vec2<u32>, count: u32, anchor: u32) -> RasterGridEdge {
    let descending = first.x > last.x || (first.x == last.x && first.y > last.y);
    let start = select(first, last, descending);
    let end = select(last, first, descending);
    let cell = select(anchor, count - anchor, descending);
    let span = end.x - start.x;
    let remainder = span % count;
    let base = start.x + (span / count) * cell;
    if (count <= 65536u) {
        let residual = remainder * cell;
        let numerator = 4096u * (residual % count) + start.y * (count - cell) + end.y * cell;
        let whole = numerator / count;
        let fraction = numerator % count;
        let low = whole & 4095u;
        // Packed brush bounds are integers. A single extra bit distinguishes
        // fractional edges from the preceding integer without float rounding.
        return RasterGridEdge(
            base + residual / count + (whole >> 12u),
            f32(low) + f32(fraction) / f32(count),
            2u * low + select(0u, 1u, fraction != 0u)
        );
    }
    let t = f32(cell) / f32(count);
    let residual = f32(remainder) * t;
    let low = 4096.0 * fract(residual) + mix(f32(start.y), f32(end.y), t);
    let carry = u32(low) >> 12u;
    let local = low - f32(carry) * 4096.0;
    return RasterGridEdge(
        base + u32(residual) + carry,
        local,
        2u * u32(local) + select(0u, 1u, fract(local) != 0.0)
    );
}

fn projectRasterAnchor(first: vec2<u32>, last: vec2<u32>, count: u32, anchor: u32,
        band: vec2<f32>, domain: vec3<f32>, range: vec2<f32>) -> f32 {
    let edge = rasterGridEdge(first, last, count, anchor);
    let relative = stableSub(f32(edge.high) * 4096.0, domain.x) + stableSub(edge.low, domain.y);
    let edgeBand = mix(band.x, band.y, f32(anchor) / f32(count));
    let offset = select(edgeBand, 1.0 - edgeBand, range.y < range.x);
    return range.x + (relative + offset) * ((range.y - range.x) / domain.z);
}

${
    coordinates.size
        ? /* wgsl */ `
var<private> rasterCell: vec2<u32>;
var<private> rasterShape: vec2<u32>;

fn rasterGridKey(first: vec2<u32>, last: vec2<u32>, count: u32, index: u32) -> vec2<u32> {
    let edge = rasterGridEdge(first, last, count, index);
    return vec2<u32>(edge.high, edge.selectionLow);
}
${coordinatePrograms.join("\n")}
`
        : ""
}

${x}
${y}

struct VSOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) @interpolate(flat) anchorPixel: vec2<f32>,
    @location(4) @interpolate(flat) cellsPerPixel: vec2<f32>,
    @location(3) @interpolate(flat) anchor: vec2<u32>,
    @location(1) @interpolate(flat) grid: vec3<u32>,
    @location(2) @interpolate(flat) pickId: u32,
    ${coordinateFields.join("\n    ")}
${
    triangle
        ? /* wgsl */ `
    @location(5) @interpolate(flat) triangle: vec2<f32>,
    @location(6) @interpolate(flat) triangleClip: vec4<f32>,
`
        : ""
}
#if defined(PLACEMENT_ENABLED)
    @location(15) @interpolate(flat) placementClip: vec4<f32>,
#endif
};

@vertex
fn vs_main(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> VSOut {
    let vertices = array<vec2<f32>, 6>(
        vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 0.0), vec2<f32>(0.0, 1.0),
        vec2<f32>(0.0, 1.0), vec2<f32>(1.0, 0.0), vec2<f32>(1.0, 1.0)
    );
    var out: VSOut;
    if (!isPlacementVisible(i)) {
        out.pos = vec4<f32>(2.0, 2.0, 0.0, 1.0);
        return out;
    }
    out.grid = vec3<u32>(read_columns(i), read_rows(i), read_cellOffset(i));
    ${copyCoordinates.join("\n    ")}
    out.pickId = ${picking ? "read_tilePickingId(i) + 1u" : "0u"};
    let targetSize = globals.renderTargetSize * globals.dpr;
    ${bounds}
    let clipStart = clamp(start, ${triangle ? "sourceMin, sourceMax" : "vec2<f32>(0.0), targetSize"});
    let clipEnd = clamp(end, ${triangle ? "sourceMin, sourceMax" : "vec2<f32>(0.0), targetSize"});
    if (any(clipStart == clipEnd)) {
        out.pos = vec4<f32>(2.0, 2.0, 0.0, 1.0);
        return out;
    }

    let shape = vec2<f32>(out.grid.xy);
    let span = end - start;
    // The approximate projection only chooses a nearby cell. Reproject its
    // boundary with the original index scale before interpolating local offsets.
    let near = clamp((clipStart - start) / span, vec2<f32>(0.0), vec2<f32>(1.0));
    out.anchor = min(vec2<u32>(round(near * shape)), out.grid.xy);
    let approx = start + span * (vec2<f32>(out.anchor) / shape);
    out.anchorPixel = vec2<f32>(
        ${x ? "anchor_x(i, out.grid.x, out.anchor.x, approx.x)" : "approx.x"},
        ${y ? "anchor_y(i, out.grid.y, out.anchor.y, approx.y)" : "approx.y"}
    );
    out.cellsPerPixel = shape / span;
    let source = mix(clipStart, clipEnd, vertices[v]);
    let pixel = ${triangle ? "vec2<f32>(0.5 * (source.x + source.y), out.triangle.x + 0.5 * out.triangle.y * (source.x - source.y))" : "source"};
    out.pos = vec4<f32>(pixel / targetSize * vec2<f32>(2.0, -2.0) + vec2<f32>(-1.0, 1.0), 0.0, 1.0);
#if defined(PLACEMENT_ENABLED)
    out.placementClip = placementClipBounds(i);
#endif
    return out;
}

struct AxisSamples {
    first: u32,
    second: u32,
    secondWeight: f32,
};

fn rasterCellIndex(anchor: u32, last: u32, offset: f32) -> u32 {
    // Keep taps inside the tile that covers the pixel center.
    let delta = floor(offset);
    let base = min(anchor - min(anchor, u32(max(-delta, 0.0))), last);
    return base + min(last - base, u32(max(delta, 0.0)));
}

fn rasterAxisSamples(center: f32, width: f32, anchor: u32, count: u32) -> AxisSamples {
    // Split the pixel footprint at the nearest grid line. Sample the midpoint
    // of each part and weight by its length. This is exact if the footprint
    // crosses at most one boundary, and bounds work for smaller cells.
    let weight = clamp(0.5 + (center - round(center)) / width, 0.0, 1.0);
    let halfWidth = width * 0.5;
    let last = count - 1u;
    let first = rasterCellIndex(anchor, last, center - halfWidth * weight);
    let second = rasterCellIndex(anchor, last, center + halfWidth * (1.0 - weight));
    if (weight == 1.0) { return AxisSamples(second, second, 0.0); }
    return AxisSamples(first, second, select(weight, 0.0, first == second));
}

// Filter after color mapping and premultiplication so categorical values
// and translucent cells blend as colors.
fn rasterCellColor(in: VSOut, cell: vec2<u32>) -> vec4<f32> {
    ${coordinates.size ? "rasterCell = cell;" : ""}
    let i = in.grid.z + cell.x + cell.y * in.grid.x;
    if (!isInstanceVisible(i)) { return vec4<f32>(0.0); }
    let color = getScaled_fill(i);
    return premultiplyAlpha(vec4<f32>(color.rgb, color.a * clamp(getScaled_opacity(i), 0.0, 1.0)));
}

fn rasterCenterColor(in: VSOut, center: vec2<f32>) -> vec4<f32> {
    let column = rasterCellIndex(in.anchor.x, in.grid.x - 1u, center.x);
    let row = rasterCellIndex(in.anchor.y, in.grid.y - 1u, center.y);
    return rasterCellColor(in, vec2<u32>(column, row));
}

fn rasterRowColor(in: VSOut, x: AxisSamples, row: u32) -> vec4<f32> {
    let first = rasterCellColor(in, vec2<u32>(x.first, row));
    if (x.secondWeight == 0.0) { return first; }
    return mix(first, rasterCellColor(in, vec2<u32>(x.second, row)), x.secondWeight);
}

fn shade(in: VSOut) -> vec4<f32> {
#if defined(PLACEMENT_ENABLED)
    if (!isInsidePlacementClip(in.pos, in.placementClip)) { discard; }
#endif
    ${
        coordinates.size
            ? `rasterShape = in.grid.xy;
    ${useCoordinates.join("\n    ")}`
            : ""
    }
${
    triangle
        ? /* wgsl */ `
    if (any(in.pos.xy < in.triangleClip.xy) || any(in.pos.xy >= in.triangleClip.zw)) { discard; }
    let separation = (in.pos.y - in.triangle.x) * in.triangle.y;
    let source = in.pos.x + vec2<f32>(separation, -separation);
    let center = (source - in.anchorPixel) * in.cellsPerPixel;
    return rasterCenterColor(in, center);
`
        : /* wgsl */ `
    let center = (in.pos.xy - in.anchorPixel) * in.cellsPerPixel;
    if (pickingEnabled) { return rasterCenterColor(in, center); }
    let width = abs(in.cellsPerPixel);
    let x = rasterAxisSamples(center.x, width.x, in.anchor.x, in.grid.x);
    let y = rasterAxisSamples(center.y, width.y, in.anchor.y, in.grid.y);
    let first = rasterRowColor(in, x, y.first);
    if (y.secondWeight == 0.0) { return first; }
    return mix(first, rasterRowColor(in, x, y.second), y.secondWeight);
`
}
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
    return shade(in);
}
`;
}

/** @extends {BaseProgram<import("../raster.js").RasterSeries>} */
export default class RasterProgram extends BaseProgram {
    /**
     * @param {import("../../renderer.js").Renderer} renderer
     * @param {import("../raster.js").RasterConfig} config
     * @param {import("../../index.d.ts").MarkProgramCreationContext} context
     */
    constructor(renderer, config, context) {
        const schema = compileRasterData(config);
        const { placementIndex } = config;
        const prepared = prepareRasterData(
            renderer.device,
            {
                ...config.data,
                placementIndex:
                    placementIndex && "data" in placementIndex
                        ? placementIndex.data
                        : undefined,
            },
            schema
        );
        const lowered = lowerRasterConfig(config, schema, prepared);
        super(renderer, lowered, context);
        this.schema = schema;
        delete this._markConfig.initialCells;
    }

    get channelSpecs() {
        return channels;
    }

    getSlotHandles() {
        const slots = super.getSlotHandles();
        const { scales } = slots;
        // Both endpoint accessors are updated through the leading scale slot.
        for (const axis of ["x", "y"]) {
            const end = scales[axis + "2"]?.default;
            if (!end) continue;
            const start = scales[axis];
            for (const [name, update] of Object.entries(start.default)) {
                start[name] = start.default[name] = (
                    /** @type {unknown[]} */ ...args
                ) =>
                    slots.batchUpdates(() => {
                        Reflect.apply(update, undefined, args);
                        Reflect.apply(end[name], undefined, args);
                    });
            }
            delete scales[axis + "2"];
        }
        return slots;
    }

    /**
     * @param {import("../shaders/channelIR.js").ChannelIR[]} irs
     * @param {import("./internal/selectionResources.js").SelectionDef[]} selections
     */
    buildShaderBody(irs, selections) {
        const coordinates = new Set(
            selections.flatMap(({ projections }) =>
                (projections ?? []).flatMap((projection) =>
                    "position" in projection ? [projection.position] : []
                )
            )
        );
        return rasterShader(
            irs,
            this._markConfig.projection,
            !!this._markConfig.picking,
            coordinates
        );
    }

    /** @returns {ReturnType<BaseProgram["getExtraResourceDefs"]>} */
    getExtraResourceDefs() {
        return [
            {
                name: "rasterCells",
                kind: "buffer",
                role: "extraBuffer",
                visibility: "fragment",
                wgslType: "array<u32>",
            },
        ];
    }

    _initializeExtraResources() {
        this._writeExtraBuffer(
            "rasterCells",
            /** @type {Uint32Array} */ (this._markConfig.initialCells),
            4
        );
    }

    /**
     * @param {import("../raster.js").RasterSeries} data
     * @param {number} [expectedCount]
     */
    replaceSeries(data, expectedCount) {
        const { count, series, cells } = prepareRasterData(
            this.device,
            data,
            this.schema
        );
        if (expectedCount !== undefined && count !== expectedCount) {
            throw new Error(
                "Raster series count must match the number of tiles."
            );
        }
        const prepared = this._seriesBuffers.prepareSeries(series, count);
        this._applyPreparedSeries(
            prepared,
            count,
            this._writeExtraBuffer("rasterCells", cells, 4)
        );
    }
}
