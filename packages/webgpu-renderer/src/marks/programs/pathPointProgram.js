import PointProgram from "./pointProgram.js";
import { getMsdfAtlasGenerator } from "../../symbols/sparseGpuPathAtlas.js";
import { asGpuBufferSource } from "../../utils/webgpuTextureUtils.js";
import { gpuLabel } from "../../utils/gpuLabel.js";

/**
 * @typedef {object} InstalledPathAtlas
 * @property {number} width
 * @property {number} height
 * @property {number} tileSize
 * @property {number} shapePixels
 * @property {number} spread
 * @property {number} pathCount
 * @property {Float32Array} entries
 */

const PATH_POINT_SHADER_BODY = /* wgsl */ `
const PI: f32 = 3.141592653589793;
const AA_COVERAGE_RADIUS_PIXELS: f32 = 0.5;
const FILL_RASTER_SAFETY_PIXELS: f32 = 0.5;
const STROKE_RASTER_SAFETY_PIXELS: f32 = 3.0;

struct PathAtlasEntry {
    uvBounds: vec4<f32>,
    localBounds: vec4<f32>,
    strokePadding: vec4<f32>,
};

struct VSOut {
#if defined(PLACEMENT_ENABLED)
    @location(15) @interpolate(flat) placementClip: vec4<f32>,
#endif
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) fill: vec4<f32>,
    @location(2) stroke: vec4<f32>,
    @location(3) fillOpacity: f32,
    @location(4) strokeOpacity: f32,
    @location(5) halfStrokeWidth: f32,
    @location(6) @interpolate(flat) pickId: u32,
    @location(7) @interpolate(flat) devicePixelsPerAtlas: f32,
};

fn culledPoint() -> VSOut {
    var out: VSOut;
#if defined(PLACEMENT_ENABLED)
    out.placementClip = vec4<f32>(-1e9);
#endif
    out.pos = vec4<f32>(0.0);
    out.uv = vec2<f32>(0.0);
    out.fill = vec4<f32>(0.0);
    out.stroke = vec4<f32>(0.0);
    out.fillOpacity = 0.0;
    out.strokeOpacity = 0.0;
    out.halfStrokeWidth = 0.0;
    out.pickId = 0u;
    out.devicePixelsPerAtlas = 0.0;
    return out;
}

@vertex
fn vs_main(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> VSOut {
    if (!isInstanceVisible(i) || !isPlacementVisible(i)) {
        return culledPoint();
    }

    let shape = u32(getScaled_shape(i));
    if (shape >= params.uPathCount) {
        return culledPoint();
    }

    var quad = array<vec2<f32>, 6>(
        vec2<f32>(0.0, 0.0),
        vec2<f32>(1.0, 0.0),
        vec2<f32>(0.0, 1.0),
        vec2<f32>(0.0, 1.0),
        vec2<f32>(1.0, 0.0),
        vec2<f32>(1.0, 1.0)
    );

    let diameter = sqrt(max(getScaled_size(i), 0.0));
    var strokeWidth = max(getScaled_strokeWidth(i), 0.0);
    let strokeOpacity = getScaled_strokeOpacity(i);
    if (strokeOpacity <= 0.0) {
        strokeWidth = 0.0;
    }
    let entry = pathAtlasEntries[shape];
    let halfStrokeWidth = strokeWidth * 0.5;
    // The antialiased outer contour is another offset curve, so its radius
    // must use the path-specific miter extent too. Keep the remaining
    // pixel-center and rasterization safety isotropic.
    let coverageRadius = halfStrokeWidth +
        AA_COVERAGE_RADIUS_PIXELS / globals.dpr;
    let rasterSafety = select(
        FILL_RASTER_SAFETY_PIXELS,
        STROKE_RASTER_SAFETY_PIXELS,
        halfStrokeWidth > 0.0
    ) / globals.dpr;
    let localMin = entry.localBounds.xy * diameter -
        entry.strokePadding.xy * coverageRadius - rasterSafety;
    let localMax = entry.localBounds.zw * diameter +
        entry.strokePadding.zw * coverageRadius + rasterSafety;
    let localScreen = mix(localMin, localMax, quad[v]);

    let angle = -getScaled_angle(i) * PI / 180.0;
    let sinTheta = sin(angle);
    let cosTheta = cos(angle);
    let rot = mat2x2<f32>(cosTheta, sinTheta, -sinTheta, cosTheta);
    let screenOffset = rot * localScreen;
    let centerX = getScaled_x(i) + getScaled_xOffset(i) + getScaled_dx(i);
    let centerY = getScaled_y(i) + getScaled_yOffset(i) + getScaled_dy(i);

    if (isOutsideVisibleRange(vec2<f32>(centerX, centerY))) {
        return culledPoint();
    }

    let pixel = vec2<f32>(centerX, centerY) + screenOffset;
    let clip = vec2<f32>(
        (pixel.x / globals.width) * 2.0 - 1.0,
        1.0 - (pixel.y / globals.height) * 2.0
    );
    let centerClip = vec2<f32>(
        (centerX / globals.width) * 2.0 - 1.0,
        1.0 - (centerY / globals.height) * 2.0
    );

    let atlasPixelsPerScreen = params.uShapePixels / max(diameter, 0.001);
    let tileCenter = vec2<f32>(params.uTileSize * 0.5);
    let tilePixel = clamp(
        tileCenter + localScreen * atlasPixelsPerScreen,
        vec2<f32>(0.5),
        vec2<f32>(params.uTileSize - 0.5)
    );
    let tileUnit = (tilePixel - vec2<f32>(0.5)) /
        max(params.uTileSize - 1.0, 1.0);

    var out: VSOut;
#if defined(PLACEMENT_ENABLED)
    out.placementClip = placementClipBounds(i);
#endif
    out.pos = vec4<f32>(
        applyPlacementClipForPoint(clip, centerClip, i),
        0.0,
        1.0
    );
    out.uv = mix(entry.uvBounds.xy, entry.uvBounds.zw, tileUnit);
    out.fill = getScaled_fill(i);
    out.stroke = getScaled_stroke(i);
    out.fillOpacity = getScaled_fillOpacity(i);
    out.strokeOpacity = strokeOpacity;
    out.halfStrokeWidth = halfStrokeWidth;
    out.pickId = 0u;
    out.devicePixelsPerAtlas = max(
        diameter * globals.dpr / params.uShapePixels,
        1.0 / params.uSpread
    );
#if defined(uniqueId_DEFINED)
    out.pickId = getScaled_uniqueId(i) + 1u;
#endif
    return out;
}

fn median3(value: vec3<f32>) -> f32 {
    return max(min(value.r, value.g), min(max(value.r, value.g), value.b));
}

fn signedDistanceInDevicePixels(
    uv: vec2<f32>,
    devicePixelsPerAtlas: f32
) -> f32 {
    let sample = textureSample(pathAtlas, pathAtlasSampler, uv).rgb;
    let median = median3(sample);
    let atlasDistance = select(
        (median * 255.0 - 128.0) / 127.0 * params.uSpread,
        median,
        params.uFloatAtlas != 0u
    );
    return atlasDistance * devicePixelsPerAtlas;
}

fn shade(in: VSOut) -> vec4<f32> {
    let distance = signedDistanceInDevicePixels(
        in.uv,
        in.devicePixelsPerAtlas
    );
    let fillCoverage = clamp(distance + 0.5, 0.0, 1.0);
    let outerCoverage = clamp(
        distance + in.halfStrokeWidth * globals.dpr + 0.5,
        0.0,
        1.0
    );
    var fillColor = in.fill;
    var strokeColor = in.stroke;
    fillColor.a *= in.fillOpacity;
    strokeColor.a *= in.strokeOpacity;
    fillColor = premultiplyAlpha(fillColor);
    strokeColor = premultiplyAlpha(strokeColor);

    var color = strokeColor * outerCoverage;
    color = mix(color, fillColor, fillCoverage);
    if (color.a <= 0.0) {
        discard;
    }
    return color;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
#if defined(PLACEMENT_ENABLED)
    if (!isInsidePlacementClip(in.pos, in.placementClip)) { discard; }
#endif
    return shade(in);
}
`;

/** Point program backed by a finite SVG-path MSDF atlas. */
export default class PathPointProgram extends PointProgram {
    /** @returns {string} */
    get shaderBody() {
        return PATH_POINT_SHADER_BODY;
    }

    /**
     * @returns {{ name: string, type: import("../../types.js").ScalarType, components: 1|2|4 }[]}
     */
    getExtraUniformLayout() {
        return [
            { name: "uTileSize", type: "f32", components: 1 },
            { name: "uShapePixels", type: "f32", components: 1 },
            { name: "uSpread", type: "f32", components: 1 },
            { name: "uPathCount", type: "u32", components: 1 },
            { name: "uFloatAtlas", type: "u32", components: 1 },
        ];
    }

    /**
     * @returns {import("../shaders/markShaderBuilder.js").ExtraResourceDef[]}
     */
    getExtraResourceDefs() {
        return [
            {
                name: "pathAtlasEntries",
                role: "extraBuffer",
                kind: "buffer",
                bufferType: "read-only-storage",
                visibility: "vertex",
                wgslName: "pathAtlasEntries",
                wgslType: "array<PathAtlasEntry>",
            },
            {
                name: "pathAtlas",
                role: "extraTexture",
                kind: "texture",
                sampleType: "float",
                dimension: "2d",
                visibility: "fragment",
                wgslName: "pathAtlas",
            },
            {
                name: "pathAtlas",
                role: "extraSampler",
                kind: "sampler",
                samplerType: "filtering",
                visibility: "fragment",
                wgslName: "pathAtlasSampler",
            },
        ];
    }

    /** @returns {void} */
    _initializeExtraResources() {
        const paths = this._markConfig.paths;
        if (!Array.isArray(paths)) {
            throw new Error("PathPoint config requires a paths array.");
        }
        if (
            this._markConfig.atlasBackend !== undefined &&
            this._markConfig.atlasBackend !== "gpu"
        ) {
            throw new Error(
                'PathPointProgram only supports atlasBackend "gpu".'
            );
        }
        const atlasFormat = this._markConfig.atlasFormat ?? "rgba8unorm";
        if (atlasFormat !== "rgba8unorm" && atlasFormat !== "rgba16float") {
            throw new Error("Unsupported PathPoint atlas texture format.");
        }
        const atlasOptions =
            /** @type {{ tileSize?: number, spread?: number, shapePadding?: number, gutter?: number, cubicTolerance?: number, normalizationSpan?: number }} */ (
                this._markConfig.atlasOptions ?? {}
            );
        const atlas = getMsdfAtlasGenerator(this.renderer).acquireAtlas(
            paths,
            { ...atlasOptions, format: atlasFormat },
            gpuLabel(this.label, "path atlas")
        );
        // Resource cleanup is tied to queue completion. Keep the rejection
        // observed here; GPU validation still reports the original error.
        atlas.completion.catch(() => {});
        this._installPathAtlas(
            atlas,
            atlas.texture,
            atlasFormat,
            atlas.entryBuffer,
            true
        );
    }

    /**
     * @param {InstalledPathAtlas} atlas
     * @param {GPUTexture} texture
     * @param {GPUTextureFormat} atlasFormat
     * @param {GPUBuffer | null} sharedEntries
     * @param {boolean} borrowed
     */
    _installPathAtlas(
        atlas,
        texture,
        atlasFormat,
        sharedEntries = null,
        borrowed = false
    ) {
        const sampler = this.device.createSampler({
            label: gpuLabel(this.label, "path atlas sampler"),
            addressModeU: "clamp-to-edge",
            addressModeV: "clamp-to-edge",
            magFilter: "linear",
            minFilter: "linear",
            mipmapFilter: "nearest",
        });
        const entries =
            sharedEntries ?? this._createPathAtlasEntries(atlas.entries);
        this._extraBuffers.set("pathAtlasEntries", entries);
        this._extraTextures.set("pathAtlas", {
            texture,
            sampler,
            width: atlas.width,
            height: atlas.height,
            format: atlasFormat,
        });
        if (borrowed) {
            this._borrowedExtraBuffers.add("pathAtlasEntries");
            this._borrowedExtraTextures.add("pathAtlas");
        }
        this._setUniformValue("uTileSize", atlas.tileSize);
        this._setUniformValue("uShapePixels", atlas.shapePixels);
        this._setUniformValue("uSpread", atlas.spread);
        this._setUniformValue("uPathCount", atlas.pathCount);
        this._setUniformValue(
            "uFloatAtlas",
            atlasFormat === "rgba16float" ? 1 : 0
        );
    }

    /** @param {Float32Array} data */
    _createPathAtlasEntries(data) {
        const entries = this.device.createBuffer({
            label: gpuLabel(this.label, "path atlas entries"),
            size: data.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(entries, 0, asGpuBufferSource(data));
        return entries;
    }
}
