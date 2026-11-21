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
    size: { type: "f32", components: 1, default: 1 },
    fill: { type: "f32", components: 4, default: [0, 0, 0, 1] },
    opacity: { type: "f32", components: 1, default: 1 },
};

/**
 * Generate source-space anchor projection only when both edges use the same
 * unpadded index mapping. Other axis configurations keep their affine
 * interpolation between the independently projected edges.
 *
 * @param {import("../shaders/channelIR.js").ChannelIR[]} irs
 * @param {"x" | "y"} axis
 */
function indexAxisShader(irs, axis) {
    const first = irs.find(({ name }) => name === axis);
    const last = irs.find(({ name }) => name === axis + "2");
    if (
        [first, last].some(
            (ir) =>
                ir.scaleType !== "index" || hasGroupingGaps(ir.channel.scale)
        )
    ) {
        return "";
    }
    /** @param {import("../shaders/channelIR.js").ChannelIR} ir */
    const domain = (ir) => domainVec3(ir.name, ir.sharedScaleName);
    /** @param {import("../shaders/channelIR.js").ChannelIR} ir */
    const range = (ir) => rangeVec2(ir.name, ir.sharedScaleName);
    /** @param {import("../shaders/channelIR.js").ChannelIR} ir */
    const bandParams = (ir) => bandParameters(ir.name, ir.sharedScaleName);
    /** @param {import("../shaders/channelIR.js").ChannelIR} ir */
    const band = (ir) => `params.${SCALE_BAND_PREFIX}${ir.name}`;
    /** @param {import("../shaders/channelIR.js").ChannelIR} ir */
    const key = ({ name, inputComponents }) => {
        const read = `read_${name}(i)`;
        return inputComponents === 2 ? read : `rasterIndexKey(${read})`;
    };
    const position = axis === "x" ? "vec2<f32>(p, 0.0)" : "vec2<f32>(0.0, p)";
    return /* wgsl */ `
fn anchor_${axis}(i: u32, count: u32, anchor: u32, fallback: f32) -> f32 {
    let domain = ${domain(first)};
    let range = ${range(first)};
    if (domain.z < 1.0 || any(domain != ${domain(last)}) || any(range != ${range(last)}) ||
        any(vec3<f32>(${bandParams(first)}).xy != vec2<f32>(0.0)) ||
        any(vec3<f32>(${bandParams(last)}).xy != vec2<f32>(0.0))) {
        return fallback;
    }

    let p = projectRasterAnchor(${key(first)}, ${key(last)}, count, anchor,
        vec2<f32>(${band(first)}, ${band(last)}), domain, range);
    return rasterTargetPixel(applyPlacementPixel(${position}, i)).${axis};
}
`;
}

/**
 * @param {import("../shaders/channelIR.js").ChannelIR[]} irs
 * @param {boolean} icon
 */
function rasterShader(irs, icon) {
    const x = icon ? "" : indexAxisShader(irs, "x");
    const y = icon ? "" : indexAxisShader(irs, "y");
    const bounds = icon
        ? /* wgsl */ `
    let area = getScaled_size(i);
    if (!(area > 0.0 && area <= 0x1.fffffep+127)) {
        out.pos = vec4<f32>(2.0, 2.0, 0.0, 1.0);
        return out;
    }
    // Apply panel placement to the anchor only. The extent is in CSS pixels.
    let halfSize = vec2<f32>(out.grid.xy) * (0.5 * sqrt(area) * globals.dpr);
    let start = first - halfSize;
    let end = first + halfSize;
`
        : /* wgsl */ `
    let start = first;
    let end = rasterTargetPixel(applyPlacementPixel(vec2<f32>(getScaled_x2(i), getScaled_y2(i)), i));
`;
    return /* wgsl */ `
fn rasterTargetPixel(pixel: vec2<f32>) -> vec2<f32> {
    return (globals.viewportOrigin - globals.renderTargetOrigin + pixel) * globals.dpr;
}

fn rasterIndexKey(value: u32) -> vec2<u32> {
    return vec2<u32>(value >> 12u, value & 4095u);
}
// Interpolate the integer cell boundary in packed coordinates. Doing the
// coarse division before the multiplication keeps the residual local even for
// tiles wider than u32. The residual product is exact for common tile sizes.
fn projectRasterAnchor(first: vec2<u32>, last: vec2<u32>, count: u32, anchor: u32,
        band: vec2<f32>, domain: vec3<f32>, range: vec2<f32>) -> f32 {
    let descending = first.x > last.x || (first.x == last.x && first.y > last.y);
    let start = select(first, last, descending);
    let end = select(last, first, descending);
    let cell = select(anchor, count - anchor, descending);
    let span = end.x - start.x;
    let remainder = span % count;
    var highOffset: u32;
    var lowOffset: f32;
    if (count <= 65536u) {
        let residual = remainder * cell;
        highOffset = residual / count;
        lowOffset = 4096.0 * (f32(residual % count) / f32(count));
    } else {
        let residual = f32(remainder) * (f32(cell) / f32(count));
        highOffset = u32(residual);
        lowOffset = 4096.0 * fract(residual);
    }
    let high = start.x + (span / count) * cell + highOffset;
    let low = f32(start.y) + lowOffset + f32(i32(end.y) - i32(start.y)) * (f32(cell) / f32(count));
    let relative = stableSub(f32(high) * 4096.0, domain.x) + stableSub(low, domain.y);
    let edgeBand = mix(band.x, band.y, f32(anchor) / f32(count));
    let offset = select(edgeBand, 1.0 - edgeBand, range.y < range.x);
    return range.x + (relative + offset) * ((range.y - range.x) / domain.z);
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
    out.pickId = 0u;
    let first = rasterTargetPixel(applyPlacementPixel(vec2<f32>(getScaled_x(i), getScaled_y(i)), i));
    ${bounds}
    let targetSize = globals.renderTargetSize * globals.dpr;
    let clipStart = clamp(start, vec2<f32>(0.0), targetSize);
    let clipEnd = clamp(end, vec2<f32>(0.0), targetSize);
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
    let pixel = mix(clipStart, clipEnd, vertices[v]);
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

fn rasterCellColor(in: VSOut, cell: vec2<u32>) -> vec4<f32> {
    let i = in.grid.z + cell.x + cell.y * in.grid.x;
    if (!isInstanceVisible(i)) { return vec4<f32>(0.0); }
    let color = getScaled_fill(i);
    return premultiplyAlpha(vec4<f32>(color.rgb, color.a * clamp(getScaled_opacity(i), 0.0, 1.0)));
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
    let center = (in.pos.xy - in.anchorPixel) * in.cellsPerPixel;
    let width = abs(in.cellsPerPixel);
    let x = rasterAxisSamples(center.x, width.x, in.anchor.x, in.grid.x);
    let y = rasterAxisSamples(center.y, width.y, in.anchor.y, in.grid.y);
    let first = rasterRowColor(in, x, y.first);
    if (y.secondWeight == 0.0) { return first; }
    return mix(first, rasterRowColor(in, x, y.second), y.secondWeight);
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
    return shade(in);
}
`;
}

/** @extends {BaseProgram<import("../raster.js").RasterData>} */
export default class RasterProgram extends BaseProgram {
    /**
     * @param {import("../../renderer.js").Renderer} renderer
     * @param {import("../raster.js").RasterConfig} config
     * @param {import("../../index.d.ts").MarkProgramCreationContext} context
     */
    constructor(renderer, config, context) {
        const schema = compileRasterData(config);
        const prepared = prepareRasterData(
            renderer.device,
            config.data,
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

    /** @param {import("../shaders/channelIR.js").ChannelIR[]} irs */
    buildShaderBody(irs) {
        // BaseProgram builds the shader before RasterProgram's constructor
        // stores the retained snapshot schema.
        return rasterShader(irs, !!this._markConfig.icon);
    }

    get hasCellPredicates() {
        return true;
    }

    /** @param {import("../shaders/channelIR.js").ChannelIR} ir */
    getFragmentSeriesRead(ir) {
        const reads =
            /** @type {ReturnType<typeof compileRasterData>["reads"]} */ (
                this._markConfig.reads
            );
        const expression = reads.get(
            /** @type {import("../raster.js").RasterCellArray} */ (
                ir.channel.data
            )
        );
        if (expression !== undefined) {
            return {
                expression,
                transparentOnNonFinite:
                    ir.scalarType === "f32" &&
                    /^fill(?:$|__cond)/.test(ir.name),
            };
        }
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
     * @param {import("../raster.js").RasterData} data
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
