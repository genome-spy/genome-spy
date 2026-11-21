import { validateStorageBufferSize } from "../../utils/bufferLimits.js";
import BaseProgram from "./internal/baseProgram.js";
import { initializePropertySlots } from "./internal/propertySlots.js";

/** @type {Record<string, import("../utils/channelSpecUtils.js").ChannelSpec>} */
const channels = {
    x: { type: "f32", components: 1, default: 0 },
    x2: { type: "f32", components: 1, default: 1 },
    y: { type: "f32", components: 1, default: 0 },
    y2: { type: "f32", components: 1, default: 1 },
    fill: { type: "f32", components: 4 },
    opacity: { type: "f32", components: 1, default: 1 },
};

/** @typedef {import("../raster.js").RasterConfig["cells"]} Cells */

const floatBits = new DataView(new ArrayBuffer(4));

/**
 * Rounding a threshold up preserves both low <= cell and cell < high
 * for float32 cells, even when the brush bounds fall between float32 values.
 * @param {number} threshold
 */
function ceilFloat32(threshold) {
    const rounded = Math.fround(threshold);
    if (!(rounded < threshold)) return rounded;
    floatBits.setFloat32(0, rounded);
    floatBits.setUint32(0, floatBits.getUint32(0) + (rounded >= 0 ? 1 : -1));
    return floatBits.getFloat32(0);
}

/** @param {boolean} integerCells */
const rasterShader = (integerCells) => /* wgsl */ `
struct VSOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) @interpolate(flat) grid: vec3<u32>,
    @location(2) @interpolate(flat) opacity: f32,
    @location(3) @interpolate(flat) pickId: u32,
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
    out.uv = vertices[v];
    out.grid = vec3<u32>(read_columns(i), read_rows(i), read_cellOffset(i));
    out.opacity = getScaled_opacity(i);
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
    let index = in.grid.z + cell.x + cell.y * shape.x;
    ${integerCells ? "" : "if ((bitcast<u32>(rasterCells[index]) & 0x7f800000u) == 0x7f800000u) { discard; }"}
    let brush = params.uCellOpacity;
    let value = f32(rasterCells[index]);
    let alpha = clamp(select(brush.w, brush.z, brush.x <= value && value < brush.y), 0.0, 1.0);
    let color = getScaled_fill(index);
    return premultiplyAlpha(vec4<f32>(color.rgb, color.a * in.opacity * alpha));
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
    return shade(in);
}
`;

export default class RasterProgram extends BaseProgram {
    get channelSpecs() {
        return channels;
    }

    get shaderBody() {
        return rasterShader(this._markConfig.cells instanceof Uint32Array);
    }

    get fragmentChannelReads() {
        return { fill: "rasterCells[i]" };
    }

    /** @returns {ReturnType<BaseProgram["getExtraResourceDefs"]>} */
    getExtraResourceDefs() {
        return [
            {
                name: "rasterCells",
                kind: "buffer",
                role: "extraBuffer",
                visibility: "fragment",
                wgslType:
                    this._markConfig.cells instanceof Uint32Array
                        ? "array<u32>"
                        : "array<f32>",
            },
        ];
    }

    _initializeExtraResources() {
        this._writeCells(/** @type {Cells} */ (this._markConfig.cells));
    }

    /** @returns {ReturnType<BaseProgram["getExtraUniformLayout"]>} */
    getExtraUniformLayout() {
        return [{ name: "uCellOpacity", type: "f32", components: 4 }];
    }

    _initializeExtraUniforms() {
        initializePropertySlots(this, {
            cellOpacity: {
                uniform: "uCellOpacity",
                default: [0, 0, 1, 1],
                encode(value) {
                    if (
                        !Array.isArray(value) ||
                        value.length !== 4 ||
                        !value.every((entry) => typeof entry === "number")
                    ) {
                        throw new Error(
                            "Raster cell opacity requires two bounds and two opacity values."
                        );
                    }
                    const [lo, hi, inside, outside] = value;
                    return [ceilFloat32(lo), ceilFloat32(hi), inside, outside];
                },
            },
        });
        this.getSlotHandles().properties.cells = {
            set: (/** @type {Cells} */ cells) => {
                this._assertAlive();
                if (this._writeCells(cells)) this._queueSlotUpdate(true);
            },
        };
    }

    /**
     * @param {Cells} cells
     * @returns {boolean} Whether the bound buffer changed.
     */
    _writeCells(cells) {
        if (
            cells.constructor !==
            /** @type {Cells} */ (this._markConfig.cells).constructor
        ) {
            throw new Error(
                "Retained raster cells must keep their original numeric type."
            );
        }
        validateStorageBufferSize(
            this.device,
            cells.byteLength,
            "Raster cells"
        );
        const previous = this._extraBuffers.get("rasterCells");
        const replace = !previous || previous.size < cells.byteLength;
        const buffer = replace
            ? this.device.createBuffer({
                  label: this.label + " cells",
                  size: Math.max(4, cells.byteLength),
                  usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
              })
            : previous;

        this.device.queue.writeBuffer(buffer, 0, cells);
        if (replace) {
            this._extraBuffers.set("rasterCells", buffer);
            previous?.destroy();
        }
        return replace;
    }
}
