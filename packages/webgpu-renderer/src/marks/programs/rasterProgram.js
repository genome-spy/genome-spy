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

const rasterShader = /* wgsl */ `
struct VSOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
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
    out.uv = vertices[v];
    out.grid = vec3<u32>(read_columns(i), read_rows(i), read_cellOffset(i));
    out.pickId = 0u;
    let start = applyPlacementPixel(vec2<f32>(getScaled_x(i), getScaled_y(i)), i);
    let end = applyPlacementPixel(vec2<f32>(getScaled_x2(i), getScaled_y2(i)), i);
    out.pos = vec4<f32>(localPixelToClip(mix(start, end, out.uv)), 0.0, 1.0);
#if defined(PLACEMENT_ENABLED)
    out.placementClip = placementClipBounds(i);
#endif
    return out;
}

fn shade(in: VSOut) -> vec4<f32> {
#if defined(PLACEMENT_ENABLED)
    if (!isInsidePlacementClip(in.pos, in.placementClip)) { discard; }
#endif
    let shape = in.grid.xy;
    let cell = min(vec2<u32>(in.uv * vec2<f32>(shape)), shape - vec2<u32>(1u));
    let i = in.grid.z + cell.x + cell.y * shape.x;
    if (!isInstanceVisible(i)) { discard; }
    let color = getScaled_fill(i);
    return premultiplyAlpha(vec4<f32>(color.rgb, color.a * clamp(getScaled_opacity(i), 0.0, 1.0)));
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
    return shade(in);
}
`;

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

    get shaderBody() {
        return rasterShader;
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
        this._writeCells(
            /** @type {Uint32Array} */ (this._markConfig.initialCells)
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
        this._applyPreparedSeries(prepared, count, this._writeCells(cells));
    }

    /** @param {Uint32Array} cells */
    _writeCells(cells) {
        const previous = this._extraBuffers.get("rasterCells");
        const replace = !previous || previous.size < cells.byteLength;
        const buffer = replace
            ? this.device.createBuffer({
                  label: this.label + " cells",
                  size: Math.max(4, cells.byteLength),
                  usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
              })
            : previous;

        if (cells.length) this.device.queue.writeBuffer(buffer, 0, cells);
        if (replace) {
            this._extraBuffers.set("rasterCells", buffer);
            previous?.destroy();
        }
        return replace;
    }
}
